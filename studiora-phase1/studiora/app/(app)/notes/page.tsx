import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Quick Notes" };

export default function Page() {
  return (
    <ComingSoon
      title="Quick Notes"
      phase={2}
      description="Catatan cepat dengan judul, kategori, tag, pencarian, dan konversi catatan menjadi materi."
    />
  );
}
