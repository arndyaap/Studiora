import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "accent" | "gold" | "success";
}) {
  const toneClass = {
    primary: "bg-primary/15 text-primary",
    accent: "bg-accent/15 text-accent",
    gold: "bg-gold/20 text-gold",
    success: "bg-success/15 text-success",
  }[tone];

  return (
    <div className="card card-hover p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className={`rounded-lg p-1.5 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}
