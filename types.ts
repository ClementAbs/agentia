export interface Job {
  id: string;
  title: string;
  company: string;
  url: string;
  description: string;
  source: string;
}

export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  linkedin?: string;
  cvPath: string;
  summary: string;
  skills: string[];
  experiences: { company: string; role: string; period: string; highlights: string[] }[];
  faq: Record<string, string>;
}

export interface SearchConfig {
  greenhouse: string[];
  lever: string[];
  franceTravail: { enabled: boolean; keywords: string; departement?: string };
  feeds: string[];
  minScore: number;
  maxPerRun: number;
  keywordsInclude: string[];
  keywordsExclude: string[];
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  redFlags: string[];
}

export interface TailoredApplication {
  coverLetter: string;
  cvHighlights: string[];
}
