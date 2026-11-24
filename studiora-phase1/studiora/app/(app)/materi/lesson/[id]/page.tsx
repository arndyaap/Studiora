import { LessonClient } from "@/components/materi/LessonClient";

export const metadata = { title: "Lesson" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonClient lessonId={id} />;
}
