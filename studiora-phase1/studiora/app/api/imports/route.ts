import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/server/ai";
import { SourceError, chunkText, loadSourceText, type LibraryRow } from "@/lib/server/source";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ libraryItemId: z.uuid() });

const num = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : d;
};

/** Apakah AI sudah dikonfigurasi (untuk UI). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ aiConfigured: aiConfigured() });
}

/** Membuat analisis baru: mengambil teks sumber dan memotongnya. AI dipanggil terpisah per potongan. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });

  if (!aiConfigured()) {
    return NextResponse.json({ error: "Layanan AI belum dikonfigurasi di server.", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const { data: item } = await supabase
    .from("library_items")
    .select("id,kind,title,url,file_path")
    .eq("id", parsed.data.libraryItemId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Item Library tidak ditemukan." }, { status: 404 });

  // Satu analisis aktif per item: bila ada yang masih berjalan (10 menit terakhir), lanjutkan itu.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: running } = await supabase
    .from("material_imports")
    .select("id,chunk_count,chunks_done,extracted_chars,truncated")
    .eq("library_item_id", item.id)
    .eq("status", "processing")
    .gte("updated_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (running) {
    return NextResponse.json({ id: running.id, chunkCount: running.chunk_count, chunksDone: running.chunks_done, chars: running.extracted_chars, truncated: running.truncated, resumed: true });
  }

  const { data: created, error: createErr } = await supabase
    .from("material_imports")
    .insert({ library_item_id: item.id, status: "pending" })
    .select("id")
    .single();
  if (createErr || !created) return NextResponse.json({ error: "Gagal memulai analisis. Pastikan migrasi 0003 sudah dijalankan." }, { status: 500 });

  try {
    const text = await loadSourceText(item as LibraryRow, supabase.storage.from("study-files"));
    const size = num(process.env.CHUNK_CHARS, 12_000, 4_000, 40_000);
    const maxChunks = num(process.env.MAX_CHUNKS, 8, 1, 20);
    const { chunks, truncated } = chunkText(text, size, maxChunks);
    const used = chunks.join("\n\n");

    const { error } = await supabase
      .from("material_imports")
      .update({
        status: "processing",
        source_text: used,
        extracted_chars: used.length,
        truncated,
        chunk_count: chunks.length,
        chunks_done: 0,
        proposal: { parts: {}, meta: { size, title: item.title } },
      })
      .eq("id", created.id);
    if (error) throw new Error("save");

    return NextResponse.json({ id: created.id, chunkCount: chunks.length, chunksDone: 0, chars: used.length, truncated });
  } catch (e) {
    const message = e instanceof SourceError ? e.message : "Gagal memproses sumber.";
    await supabase.from("material_imports").update({ status: "failed", error_message: message }).eq("id", created.id);
    return NextResponse.json({ error: message }, { status: e instanceof SourceError ? 422 : 500 });
  }
}
