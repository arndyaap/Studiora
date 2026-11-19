"use client";

import { useEffect, useState } from "react";
import { greetingFor } from "@/lib/utils";

export function Greeting({ name }: { name: string }) {
  // Dihitung di browser agar memakai jam & zona waktu perangkat pengguna.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const date = now
    ? new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)
    : " ";

  return (
    <div className="animate-fade-up">
      <p className="text-sm text-muted">{date}</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">
        {now ? greetingFor(now.getHours()) : "Hello"}, {name}!
      </h1>
      <p className="mt-1 text-sm text-muted">Ready to learn something new today?</p>
    </div>
  );
}
