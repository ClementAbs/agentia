import { askJSON } from "./llm.js";
import { Job, Profile, TailoredApplication } from "./types.js";

const SYSTEM = `Tu rédiges des candidatures sincères et percutantes.
RÈGLES ABSOLUES :
- N'invente aucune expérience, compétence, diplôme ou chiffre absent du profil.
- Lettre : 150-220 mots, ton professionnel et direct, dans la langue de l'offre, sans formules creuses.
- Relie 2-3 réalisations réelles du profil aux besoins précis de l'offre.
Retourne : {"coverLetter": string, "cvHighlights": string[]}
(cvHighlights = 3-5 points du profil à mettre en avant pour cette offre.)`;

export async function tailor(job: Job, profile: Profile): Promise<TailoredApplication> {
  return askJSON<TailoredApplication>(
    SYSTEM,
    `PROFIL:\n${JSON.stringify(profile, null, 2)}\n\nOFFRE:\nTitre: ${job.title}\nEntreprise: ${job.company}\n${job.description}`
  );
}
