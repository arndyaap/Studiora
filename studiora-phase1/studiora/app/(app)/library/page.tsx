import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Library" };

export default function Page() {
  return (
    <ComingSoon
      title="Library"
      phase={2}
      description="Arsip referensi pribadi: e-book, artikel, paper, tautan, dengan pencarian, filter, dan bookmark."
    />
  );
}
