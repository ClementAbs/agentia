import Database from "better-sqlite3";
import { Job, ScoreResult, TailoredApplication } from "./types.js";

const db = new Database("data/agent.db");
db.exec(`
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  title TEXT, company TEXT, url TEXT, description TEXT,
  score INTEGER, reasons TEXT, red_flags TEXT,
  cover_letter TEXT, cv_highlights TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
)`);

export function exists(id: string): boolean {
  return !!db.prepare("SELECT 1 FROM applications WHERE id = ?").get(id);
}

export function save(job: Job, s: ScoreResult, t: TailoredApplication | null, status = "pending") {
  db.prepare(
    `INSERT OR IGNORE INTO applications
     (id,title,company,url,description,score,reasons,red_flags,cover_letter,cv_highlights,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    job.id, job.title, job.company, job.url, job.description, s.score,
    JSON.stringify(s.reasons), JSON.stringify(s.redFlags),
    t?.coverLetter ?? null, t ? JSON.stringify(t.cvHighlights) : null, status
  );
}

export function listByStatus(status: string) {
  return db.prepare("SELECT * FROM applications WHERE status = ? ORDER BY score DESC").all(status) as any[];
}

export function get(id: string) {
  return db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as any;
}

export function setStatus(id: string, status: string) {
  db.prepare(
    "UPDATE applications SET status = ?, applied_at = CASE WHEN ? = 'applied' THEN CURRENT_TIMESTAMP ELSE applied_at END WHERE id = ?"
  ).run(status, status, id);
}
