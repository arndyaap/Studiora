import { ImportClient } from "@/components/library/ImportClient";

export const metadata = { title: "Jadikan Materi" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImportClient itemId={id} />;
}
