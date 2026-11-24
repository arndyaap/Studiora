import "server-only";

export class AiError extends Error {}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Model bisa diganti lewat env AI_MODEL tanpa mengubah kode. */
const MODEL = () => process.env.AI_MODEL || "claude-haiku-5-5";

/**
 * Memanggil Claude lewat Messages API. Kunci hanya dibaca di server.
 * Mengembalikan teks balasan.
 */
export async function askClaude(params: { system: string; user: string; maxTokens?: number }): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("ANTHROPIC_API_KEY belum dikonfigurasi di server.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: params.maxTokens ?? 4096,
        system: params.system,
        messages: [{ role: "user", content: params.user }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AiError("AI terlalu lama merespons. Coba lagi, atau kecilkan CHUNK_CHARS.");
    throw new AiError("Tidak bisa terhubung ke layanan AI.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401) throw new AiError("API key AI tidak valid. Periksa ANTHROPIC_API_KEY.");
    if (res.status === 403) throw new AiError("API key AI tidak punya izin untuk model ini.");
    if (res.status === 404) throw new AiError(`Model AI "${MODEL()}" tidak ditemukan. Atur env AI_MODEL.`);
    if (res.status === 429) throw new AiError("Batas pemakaian AI tercapai. Tunggu sebentar lalu coba lagi.");
    if (res.status === 402 || res.status === 400) {
      const body = await res.text().catch(() => "");
      if (/credit|billing/i.test(body)) throw new AiError("Saldo API AI tidak cukup. Isi saldo di console Anthropic.");
      throw new AiError("Permintaan ke AI ditolak.");
    }
    throw new AiError("Layanan AI sedang bermasalah. Coba lagi nanti.");
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  if (!text.trim()) throw new AiError("AI tidak mengembalikan jawaban.");
  return text;
}

/** Mengambil objek JSON dari balasan model (mengabaikan pagar kode atau teks di sekitarnya). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AiError("Jawaban AI bukan JSON.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError("Jawaban AI bukan JSON yang valid.");
  }
}
