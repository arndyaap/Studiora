import { Hourglass } from "lucide-react";

export function ComingSoon({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="rounded-2xl bg-primary/15 p-3 text-primary">
          <Hourglass className="h-6 w-6" />
        </span>
        <p className="font-display text-lg font-bold">Belum dibangun — dijadwalkan di Phase {phase}</p>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
