import { chromium, Page } from "playwright";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { askJSON } from "./llm.js";
import { Profile } from "./types.js";

interface Field {
  key: string;
  tag: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
}

async function extractFields(page: Page): Promise<Field[]> {
  return page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll("input, textarea, select").forEach((el: any, i) => {
      if (["hidden", "submit", "button", "image"].includes(el.type)) return;
      el.setAttribute("data-agent-id", String(i));
      const label =
        el.labels?.[0]?.innerText || el.getAttribute("aria-label") || el.placeholder || el.name || "";
      out.push({
        key: String(i),
        tag: el.tagName.toLowerCase(),
        type: el.type,
        label: String(label).trim(),
        required: !!el.required,
        options: el.tagName === "SELECT" ? [...el.options].map((o: any) => o.text) : undefined,
      });
    });
    return out;
  });
}

async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(question + " (o/N) ");
  rl.close();
  return a.trim().toLowerCase().startsWith("o");
}

export async function applyTo(
  url: string,
  profile: Profile,
  coverLetter: string,
  opts: { requireApproval: boolean }
): Promise<"applied" | "skipped" | "failed"> {
  const browser = await chromium.launch({ headless: false }); // visible : vous gardez le contrôle
  const page = await (await browser.newContext()).newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const fields = await extractFields(page);
    if (fields.length === 0) {
      console.log("Aucun formulaire détecté (bouton 'Postuler' à cliquer ? Captcha ? Connexion requise ?).");
      console.log("Finalisez manuellement dans la fenêtre ouverte.");
      const done = await ask("Candidature envoyée à la main ?");
      return done ? "applied" : "skipped";
    }

    const { answers } = await askJSON<{ answers: Record<string, string | boolean | null> }>(
      `Tu remplis un formulaire de candidature pour l'utilisateur, uniquement à partir de son profil.
Pour chaque champ (clé = key), donne la valeur à saisir. Règles :
- Pour "select", la valeur doit être exactement l'une des options.
- Pour "checkbox", true/false. Pour un champ fichier, mets "CV".
- Pour la lettre de motivation / message, mets "LETTRE".
- Si l'information n'est pas dans le profil : null (ne rien inventer).
Retourne {"answers": {"<key>": valeur|null}}`,
      `PROFIL:\n${JSON.stringify(profile)}\n\nCHAMPS:\n${JSON.stringify(fields)}`
    );

    const needsHuman: string[] = [];
    for (const f of fields) {
      const v = answers[f.key];
      const loc = page.locator(`[data-agent-id="${f.key}"]`).first();
      try {
        if (v === null || v === undefined) {
          if (f.required) needsHuman.push(f.label || f.key);
          continue;
        }
        if (f.type === "file") await loc.setInputFiles(resolve(profile.cvPath));
        else if (f.type === "checkbox") v ? await loc.check() : await loc.uncheck();
        else if (f.tag === "select") await loc.selectOption({ label: String(v) });
        else await loc.fill(v === "LETTRE" ? coverLetter : String(v));
      } catch {
        needsHuman.push(f.label || f.key);
      }
    }

    if (needsHuman.length) console.log("Champs à compléter à la main :", needsHuman.join(", "));
    await page.screenshot({ path: `data/preview-${Date.now()}.png`, fullPage: true });

    if (opts.requireApproval) {
      const ok = await ask("Relisez le formulaire dans le navigateur. Soumettre ?");
      if (!ok) return "skipped";
    }

    const submit = page
      .getByRole("button", { name: /postuler|envoyer|soumettre|submit|apply|send/i })
      .first();
    await submit.click();
    await page.waitForTimeout(3000);
    return "applied";
  } catch (e) {
    console.error("Échec :", (e as Error).message);
    return "failed";
  } finally {
    await browser.close();
  }
}
