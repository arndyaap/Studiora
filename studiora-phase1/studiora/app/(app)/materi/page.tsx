import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Materi" };

export default function Page() {
  return (
    <ComingSoon
      title="Materi"
      phase={2}
      description="Knowledge Center bertingkat (Kategori → Subject → Modul → Lesson) lengkap dengan editor materi."
    />
  );
}
