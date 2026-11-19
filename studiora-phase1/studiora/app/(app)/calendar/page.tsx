import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Kalender" };

export default function Page() {
  return (
    <ComingSoon
      title="Kalender"
      phase={2}
      description="Tampilan bulanan, mingguan, dan agenda harian dengan kategori warna, deadline, dan pengingat."
    />
  );
}
