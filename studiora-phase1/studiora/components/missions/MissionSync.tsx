"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { syncMissions, type CompletedMission } from "@/lib/xp";

const KEY = "studiora:mission-sync";

/** Menyinkronkan misi saat aplikasi dibuka (maksimal sekali per 5 menit) dan menampilkan toast bila ada misi selesai. */
export function MissionSync() {
  const router = useRouter();
  const [done, setDone] = useState<CompletedMission[]>([]);

  useEffect(() => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY)) || 0;
    } catch {}
    if (Date.now() - last < 5 * 60_000) return;
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {}
    (async () => {
      const completed = await syncMissions(createClient());
      if (completed.length) {
        setDone(completed);
        router.refresh();
        setTimeout(() => setDone([]), 6000);
      }
    })();
  }, [router]);

  if (!done.length) return null;
  return (
    <div role="status" className="fixed bottom-24 right-4 z-40 max-w-xs animate-fade-up card flex items-start gap-3 p-4 lg:bottom-6">
      <span className="rounded-lg bg-primary/15 p-2 text-primary"><Swords className="h-4 w-4" /></span>
      <div className="text-sm">
        <p className="font-semibold">Misi selesai!</p>
        <p className="text-muted">{done.map((m) => `${m.title}${m.xp ? ` (+${m.xp} XP)` : ""}`).join(", ")}</p>
      </div>
    </div>
  );
}
