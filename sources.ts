import Parser from "rss-parser";
import { createHash } from "node:crypto";
import { Job, SearchConfig } from "./types.js";

const parser = new Parser();
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

/** Flux RSS (pages carrières qui en proposent un). */
async function fromRss(url: string): Promise<Job[]> {
  const feed = await parser.parseURL(url);
  return feed.items.map((it) => ({
    id: hash(it.link ?? it.guid ?? it.title ?? ""),
    title: it.title ?? "",
    company: (it as any).creator ?? feed.title ?? "",
    url: it.link ?? "",
    description: stripHtml(it.contentSnippet ?? it.content ?? ""),
    source: url,
  }));
}

/** Greenhouse : API publique, le token est la fin de l'URL job-boards.greenhouse.io/<token>. */
async function fromGreenhouse(token: string): Promise<Job[]> {
  const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  if (!r.ok) throw new Error(`Greenhouse ${token}: HTTP ${r.status}`);
  const data: any = await r.json();
  return (data.jobs ?? []).map((j: any) => ({
    id: hash(`gh-${token}-${j.id}`),
    title: j.title,
    company: token,
    url: j.absolute_url,
    description: stripHtml(`${j.location?.name ?? ""}. ${j.content ?? ""}`),
    source: `greenhouse:${token}`,
  }));
}

/** Lever : API publique, le nom est la fin de l'URL jobs.lever.co/<nom>. */
async function fromLever(name: string): Promise<Job[]> {
  const r = await fetch(`https://api.lever.co/v0/postings/${name}?mode=json`);
  if (!r.ok) throw new Error(`Lever ${name}: HTTP ${r.status}`);
  const data: any[] = await r.json();
  return data.map((j) => ({
    id: hash(`lv-${name}-${j.id}`),
    title: j.text,
    company: name,
    url: j.hostedUrl,
    description: (j.descriptionPlain ?? "").slice(0, 6000),
    source: `lever:${name}`,
  }));
}

/** France Travail : API officielle. Créez une application sur https://francetravail.io
 *  (API "Offres d'emploi v2") puis mettez FT_CLIENT_ID et FT_CLIENT_SECRET dans .env. */
async function fromFranceTravail(cfg: SearchConfig["franceTravail"]): Promise<Job[]> {
  const id = process.env.FT_CLIENT_ID;
  const secret = process.env.FT_CLIENT_SECRET;
  if (!id || !secret) throw new Error("FT_CLIENT_ID / FT_CLIENT_SECRET manquants dans .env");

  const tokRes = await fetch(
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
        scope: "api_offresdemploiv2 o2dsoffre",
      }),
    }
  );
  if (!tokRes.ok) throw new Error(`France Travail auth: HTTP ${tokRes.status}`);
  const { access_token } = (await tokRes.json()) as { access_token: string };

  const qs = new URLSearchParams({ motsCles: cfg.keywords, range: "0-49" });
  if (cfg.departement) qs.set("departement", cfg.departement);
  const r = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${qs}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (r.status === 204) return [];
  if (!r.ok) throw new Error(`France Travail search: HTTP ${r.status}`);
  const data: any = await r.json();
  return (data.resultats ?? []).map((o: any) => ({
    id: hash(`ft-${o.id}`),
    title: o.intitule,
    company: o.entreprise?.nom ?? "Non précisé",
    url: o.origineOffre?.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
    description: (o.description ?? "").slice(0, 6000),
    source: "francetravail",
  }));
}

async function safe(label: string, fn: () => Promise<Job[]>): Promise<Job[]> {
  try {
    const jobs = await fn();
    console.log(`${label} : ${jobs.length} offres`);
    return jobs;
  } catch (e) {
    console.warn(`${label} ignoré :`, (e as Error).message);
    return [];
  }
}

export async function discoverJobs(cfg: SearchConfig): Promise<Job[]> {
  const all: Job[] = [];
  for (const t of cfg.greenhouse ?? []) all.push(...(await safe(`Greenhouse/${t}`, () => fromGreenhouse(t))));
  for (const n of cfg.lever ?? []) all.push(...(await safe(`Lever/${n}`, () => fromLever(n))));
  if (cfg.franceTravail?.enabled)
    all.push(...(await safe("France Travail", () => fromFranceTravail(cfg.franceTravail))));
  for (const f of cfg.feeds ?? []) all.push(...(await safe(`RSS/${f}`, () => fromRss(f))));

  const inc = cfg.keywordsInclude.map((k) => k.toLowerCase());
  const exc = cfg.keywordsExclude.map((k) => k.toLowerCase());
  return all.filter((j) => {
    const txt = `${j.title} ${j.description}`.toLowerCase();
    const okInc = inc.length === 0 || inc.some((k) => txt.includes(k));
    const okExc = !exc.some((k) => txt.includes(k));
    return okInc && okExc && j.url;
  });
}
