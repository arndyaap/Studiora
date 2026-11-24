import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractText, getDocumentProxy } from "unpdf";

export class SourceError extends Error {}

const MAX_BYTES = 8 * 1024 * 1024; // batas unduhan link/PDF
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

// ---------- Keamanan: cegah akses ke jaringan internal (SSRF) ----------
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SourceError("Alamat link tidak valid.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SourceError("Hanya link http atau https yang didukung.");
  if (u.username || u.password) throw new SourceError("Link dengan nama pengguna atau kata sandi tidak didukung.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new SourceError("Link ke alamat internal diblokir.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new SourceError("Alamat link tidak bisa ditemukan.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new SourceError("Link ke alamat internal diblokir.");
  return u;
}

async function readLimited(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) throw new SourceError("Isi link kosong.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new SourceError("Ukuran dokumen terlalu besar (maksimal 8 MB).");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Mengunduh URL publik dengan pengecekan alamat di setiap pengalihan, batas waktu, dan batas ukuran. */
async function safeFetch(raw: string): Promise<{ bytes: Uint8Array; contentType: string; finalUrl: string }> {
  let url = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertPublicUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; StudioraBot/1.0)", accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5" },
      });
    } catch (e) {
      throw new SourceError((e as Error).name === "AbortError" ? "Link terlalu lama merespons." : "Link tidak bisa dibuka.");
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new SourceError("Link mengalihkan ke tujuan yang tidak valid.");
      url = new URL(loc, u).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new SourceError("Halaman ini butuh login atau memblokir akses otomatis, jadi isinya tidak bisa dibaca.");
    if (res.status === 404) throw new SourceError("Halaman tidak ditemukan (404).");
    if (!res.ok) throw new SourceError(`Link tidak bisa dibuka (kode ${res.status}).`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new SourceError("Ukuran dokumen terlalu besar (maksimal 8 MB).");
    const bytes = await readLimited(res);
    return { bytes, contentType: (res.headers.get("content-type") ?? "").toLowerCase(), finalUrl: u.toString() };
  }
  throw new SourceError("Terlalu banyak pengalihan link.");
}

// ---------- HTML dan PDF menjadi teks ----------
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
function decodeEntities(s: string) {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)));
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let body = html;
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/<(script|style|noscript|svg|iframe|form|template|canvas)[\s\S]*?<\/\1>/gi, " ");
  // Utamakan <article>, lalu <main>; jika tidak ada pakai seluruh <body>.
  const main = body.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? body.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? body;
  const cleaned = main.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ");
  const text = decodeEntities(
    cleaned
      .replace(/<(h[1-6])[^>]*>/gi, "\n\n## ")
      .replace(/<\/(p|div|section|li|tr|h[1-6]|blockquote|ul|ol|table)>/gi, "\n")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return pages
      .map((t, i) => `[Halaman ${i + 1}]\n${t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()}`)
      .join("\n\n");
  } catch {
    throw new SourceError("PDF tidak bisa dibaca (rusak atau dilindungi kata sandi).");
  }
}

export type LibraryRow = { id: string; kind: string; title: string; url: string | null; file_path: string | null };
type Storage = { download: (path: string) => Promise<{ data: Blob | null; error: unknown }> };

export const MIN_CHARS = 300;

/** Mengambil teks dari item Library: file PDF/teks di storage, atau isi link. */
export async function loadSourceText(item: LibraryRow, storage: Storage): Promise<string> {
  let text = "";

  if (item.file_path) {
    const lower = item.file_path.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isText = /\.(txt|csv|md)$/.test(lower);
    if (!isPdf && !isText) throw new SourceError("Jenis file ini belum didukung. Saat ini hanya PDF dan file teks (txt, csv).");
    const { data, error } = await storage.download(item.file_path);
    if (error || !data) throw new SourceError("File tidak bisa diambil dari penyimpanan.");
    if (data.size > MAX_BYTES) throw new SourceError("Ukuran dokumen terlalu besar (maksimal 8 MB).");
    const bytes = new Uint8Array(await data.arrayBuffer());
    text = isPdf ? await pdfToText(bytes) : new TextDecoder().decode(bytes);
  } else if (item.url) {
    const { bytes, contentType, finalUrl } = await safeFetch(item.url);
    if (contentType.includes("pdf") || finalUrl.toLowerCase().split("?")[0].endsWith(".pdf")) {
      text = await pdfToText(bytes);
    } else if (contentType.includes("html") || contentType.includes("xml") || contentType === "") {
      text = htmlToText(new TextDecoder().decode(bytes)).text;
    } else if (contentType.startsWith("text/")) {
      text = new TextDecoder().decode(bytes);
    } else {
      throw new SourceError("Jenis isi link ini belum didukung (hanya halaman web, PDF, dan teks).");
    }
  } else {
    throw new SourceError("Item Library ini tidak punya URL maupun file.");
  }

  // Buang karakter kontrol dan angka halaman yang tidak berarti, lalu cek kecukupan isi.
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  const meaningful = text.replace(/\[Halaman \d+\]/g, "").replace(/\s+/g, "");
  if (meaningful.length < MIN_CHARS) {
    throw new SourceError(
      item.file_path || /pdf/i.test(item.url ?? "")
        ? "Hampir tidak ada teks yang terbaca. PDF ini kemungkinan hasil scan (berupa gambar), yang belum didukung."
        : "Hampir tidak ada teks yang terbaca dari halaman ini. Halamannya mungkin dimuat lewat JavaScript, butuh login, atau memang sangat pendek.",
    );
  }
  return text;
}

/** Memotong teks menjadi potongan berukuran wajar pada batas paragraf. */
export function chunkText(text: string, size: number, maxChunks: number): { chunks: string[]; truncated: boolean } {
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };
  for (const p of paras) {
    if (p.length > size) {
      push();
      for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
      continue;
    }
    if (cur.length + p.length + 2 > size) push();
    cur += (cur ? "\n\n" : "") + p;
  }
  push();
  return { chunks: chunks.slice(0, maxChunks), truncated: chunks.length > maxChunks };
}
