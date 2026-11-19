export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function greetingFor(hour: number) {
  if (hour < 11) return "Good Morning";
  if (hour < 15) return "Good Afternoon";
  if (hour < 19) return "Good Evening";
  return "Good Night";
}

export function formatMinutes(mins: number) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}j` : `${h}j ${r}m`;
}

export function hoursFromMinutes(mins: number) {
  return Math.round((mins / 60) * 10) / 10;
}

/** YYYY-MM-DD dalam zona waktu lokal (bukan UTC) */
export function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "S"
  );
}
