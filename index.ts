import { readFileSync } from "node:fs";
import { discoverJobs } from "./sources.js";
import { scoreJob } from "./score.js";
import { tailor } from "./tailor.js";
import { applyTo } from "./apply.js";
import * as db from "./db.js";
import { Profile, SearchConfig } from "./types.js";

const profile: Profile = JSON.parse(readFileSync("config/profile.json", "utf8"));
const cfg: SearchConfig = JSON.parse(readFileSync("config/search.json", "utf8"));

async function discover() {
  const jobs = (await discoverJobs(cfg)).filter((j) => !db.exists(j.id)).slice(0, cfg.maxPerRun);
  console.log(`${jobs.length} nouvelles offres à évaluer`);
  for (const job of jobs) {
    const s = await scoreJob(job, profile);
    if (s.score < cfg.minScore) {
      db.save(job, s, null, "skipped");
      console.log(`✗ ${s.score}  ${job.title} — ${job.company}`);
      continue;
    }
    const t = await tailor(job, profile);
    db.save(job, s, t, "pending");
    console.log(`✓ ${s.score}  ${job.title} — ${job.company}  [id: ${job.id}]`);
  }
}

function review() {
  for (const a of db.listByStatus("pending")) {
    console.log(`\n[${a.id}] ${a.score}/100 — ${a.title} @ ${a.company}\n${a.url}`);
    console.log("Atouts :", JSON.parse(a.reasons).join(" | "));
    console.log("Alertes :", JSON.parse(a.red_flags).join(" | ") || "aucune");
  }
}

async function apply(id?: string) {
  const list = id ? [db.get(id)] : db.listByStatus("pending");
  for (const a of list) {
    if (!a) continue;
    console.log(`\n→ ${a.title} @ ${a.company}\n\n${a.cover_letter}\n`);
    const status = await applyTo(a.url, profile, a.cover_letter, { requireApproval: true });
    db.setStatus(a.id, status);
    console.log(`Statut : ${status}`);
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "discover") await discover();
else if (cmd === "review") review();
else if (cmd === "apply") await apply(arg);
else console.log("Usage : npm run discover | review | apply [id]");
