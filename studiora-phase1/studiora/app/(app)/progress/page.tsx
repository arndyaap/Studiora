import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Progress" };

export default function Page() {
  return (
    <ComingSoon
      title="Progress"
      phase={4}
      description="Learning Analytics: grafik interaktif dan insight yang dihitung dari aktivitas belajar nyata."
    />
  );
}
