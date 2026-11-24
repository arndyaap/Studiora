import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applySchema } from "@/lib/server/import-schema";
import { escapeHtml } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

/** Menerapkan usulan terpilih: membuat Subject, Modul, Lesson, dan (opsional) jadwal Kalender. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = applySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data yang dikirim tidak valid. Periksa judul dan pilihan Anda." }, { status: 400 });
  const p = parsed.data;

  const { data: imp } = await supabase.from("material_imports").select("id,status,library_item_id").eq("id", id).maybeSingle();
  if (!imp) return NextResponse.json({ error: "Analisis tidak ditemukan." }, { status: 404 });

  const { data: item } = await supabase.from("library_items").select("id,title,url").eq("id", imp.library_item_id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Item Library sumber sudah tidak ada." }, { status: 409 });

  // Penjaga ganda-klik: hanya satu permintaan yang berhasil mengubah ready -> applied.
  const { data: claimed } = await supabase.from("material_imports").update({ status: "applied" }).eq("id", id).eq("status", "ready").select("id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ error: "Usulan ini sudah diterapkan atau belum siap." }, { status: 409 });

  let newCategoryId: string | null = null;
  let subjectId: string | null = null;

  async function rollback(message: string) {
    if (subjectId) await supabase.from("subjects").delete().eq("id", subjectId); // cascade: modul, lesson
    if (newCategoryId) await supabase.from("categories").delete().eq("id", newCategoryId);
    await supabase.from("material_imports").update({ status: "ready" }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 1. Kategori
  let categoryId: string;
  if ("id" in p.category) {
    const { data } = await supabase.from("categories").select("id").eq("id", p.category.id).maybeSingle();
    if (!data) return rollback("Kategori tujuan tidak ditemukan.");
    categoryId = data.id;
  } else {
    const { data: existing } = await supabase.from("categories").select("id").eq("name", p.category.newName).maybeSingle();
    if (existing) categoryId = existing.id;
    else {
      const { count } = await supabase.from("categories").select("id", { count: "exact", head: true });
      const { data, error } = await supabase.from("categories").insert({ name: p.category.newName, position: count ?? 0 }).select("id").single();
      if (error || !data) return rollback("Gagal membuat kategori.");
      categoryId = data.id;
      newCategoryId = data.id;
    }
  }

  // 2. Subject
  const { count: subCount } = await supabase.from("subjects").select("id", { count: "exact", head: true }).eq("category_id", categoryId);
  const { data: subject, error: subErr } = await supabase
    .from("subjects")
    .insert({ category_id: categoryId, name: p.subjectTitle, description: `Dari Library: ${item.title}`.slice(0, 500), position: subCount ?? 0 })
    .select("id")
    .single();
  if (subErr || !subject) return rollback("Gagal membuat subject.");
  subjectId = subject.id;

  // 3. Modul dan Lesson
  const events: Record<string, unknown>[] = [];
  for (let mi = 0; mi < p.modules.length; mi++) {
    const m = p.modules[mi];
    const { data: mod, error: modErr } = await supabase.from("modules").insert({ subject_id: subject.id, name: m.title, position: mi }).select("id").single();
    if (modErr || !mod) return rollback("Gagal membuat modul.");

    const rows = m.lessons.map((l, li) => ({
      module_id: mod.id,
      title: l.title,
      description: l.description,
      objectives: l.objectives,
      content_html: l.sourceRef ? `<p>Rujukan sumber: ${escapeHtml(l.sourceRef)}</p>` : "",
      external_refs: item.url ? [{ title: item.title, url: item.url }] : [],
      estimated_minutes: l.minutes,
      source_library_item_id: item.id,
      position: li,
    }));
    const { data: created, error: lesErr } = await supabase.from("lessons").insert(rows).select("id,position");
    if (lesErr || !created || created.length !== rows.length) return rollback("Gagal membuat lesson.");

    const byPos = new Map(created.map((c) => [c.position as number, c.id as string]));
    m.lessons.forEach((l, li) => {
      if (l.schedule) {
        events.push({
          title: `Belajar: ${l.title}`.slice(0, 200),
          description: l.sourceRef ? `Sumber: ${item.title} (${l.sourceRef})` : `Sumber: ${item.title}`,
          category: "study_session",
          starts_at: l.schedule.starts_at,
          ends_at: l.schedule.ends_at,
          lesson_id: byPos.get(li) ?? null,
        });
      }
    });
  }

  // 4. Jadwal
  if (events.length) {
    const { error: evErr } = await supabase.from("calendar_events").insert(events);
    if (evErr) return rollback("Gagal membuat jadwal di Kalender.");
  }

  const lessonCount = p.modules.reduce((n, m) => n + m.lessons.length, 0);
  await supabase.from("material_imports").update({ applied_subject_id: subject.id }).eq("id", id);
  await supabase.from("notifications").insert({
    type: "schedule",
    title: `Materi dari Library ditambahkan: ${p.subjectTitle}`,
    body: `${lessonCount} lesson${events.length ? `, ${events.length} dijadwalkan` : ""}`,
  });

  return NextResponse.json({ subjectId: subject.id, categoryId, lessons: lessonCount, scheduled: events.length });
}
