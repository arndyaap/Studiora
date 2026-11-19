import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Focus Room" };

export default function Page() {
  return (
    <ComingSoon
      title="Focus Room"
      phase={4}
      description="Pomodoro, stopwatch, riwayat sesi, dan target fokus harian yang terhubung ke statistik dan XP."
    />
  );
}
