import { askJSON } from "./llm.js";
import { Job, Profile, ScoreResult } from "./types.js";

const SYSTEM = `Tu es un recruteur senior qui évalue l'adéquation entre un profil et une offre.
Note de 0 à 100. Sois sévère : 70+ = candidature vraiment pertinente.
Retourne : {"score": number, "reasons": string[], "redFlags": string[]}`;

export async function scoreJob(job: Job, profile: Profile): Promise<ScoreResult> {
  return askJSON<ScoreResult>(
    SYSTEM,
    `PROFIL:\n${JSON.stringify(profile, null, 2)}\n\nOFFRE:\nTitre: ${job.title}\nEntreprise: ${job.company}\n${job.description}`
  );
}
