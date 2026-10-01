import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * PROVIDER=anthropic (défaut, payant) ou PROVIDER=openai (gratuit possible) :
 * "openai" = tout serveur compatible API OpenAI : Ollama en local, Groq, Gemini...
 */
const PROVIDER = (process.env.PROVIDER ?? "anthropic").toLowerCase();
export const MODEL =
  process.env.MODEL ?? (PROVIDER === "anthropic" ? "claude-sonnet-5-5" : "qwen2.5:7b");

let anthropic: Anthropic | undefined;

async function callAnthropic(system: string, user: string, maxTokens: number): Promise<string> {
  anthropic ??= new Anthropic();
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return r.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
}

async function callOpenAI(system: string, user: string, maxTokens: number, json: boolean): Promise<string> {
  const base = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1"; // Ollama par défaut
  let r: Response;
  try {
    r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? "ollama"}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch {
    throw new Error(`Serveur LLM injoignable (${base}). Ollama est-il lancé ? (ollama serve)`);
  }
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${await r.text()}`);
  const data: any = await r.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function call(system: string, user: string, maxTokens: number, json: boolean): Promise<string> {
  return PROVIDER === "anthropic"
    ? callAnthropic(system, user, maxTokens)
    : callOpenAI(system, user, maxTokens, json);
}

export async function askText(system: string, user: string): Promise<string> {
  return call(system, user, 2000, false);
}

export async function askJSON<T>(system: string, user: string): Promise<T> {
  const raw = await call(
    system + "\nRéponds uniquement avec un JSON valide, sans texte autour ni balises markdown.",
    user,
    3000,
    true
  );
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Réponse du modèle sans JSON : " + raw.slice(0, 200));
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
