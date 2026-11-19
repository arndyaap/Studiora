import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Tabel milik pengguna yang disertakan dalam export. RLS memastikan hanya data milik sendiri yang terbaca.
const TABLES = [
  "profiles",
  "user_settings",
  "categories",
  "subjects",
  "modules",
  "lessons",
  "lesson_notes",
  "calendar_events",
  "missions",
  "quiz_questions",
  "quiz_attempts",
  "study_sessions",
  "xp_transactions",
  "rewards",
  "reward_transactions",
  "user_achievements",
  "library_items",
  "quick_notes",
  "notifications",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = await Promise.all(TABLES.map((t) => supabase.from(t).select("*")));

  const failed = TABLES.filter((_, i) => results[i].error);
  const data: Record<string, unknown> = {};
  TABLES.forEach((t, i) => {
    data[t] = results[i].data ?? [];
  });

  const payload = {
    app: "STUDIORA",
    version: 1,
    exported_at: new Date().toISOString(),
    incomplete_tables: failed,
    data,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="studiora-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
