import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const FILE_TYPES = [
  ...IMAGE_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/epub+zip",
];

export type UploadResult = { ok: true; url: string; path: string; name: string; size: number } | { ok: false; error: string };

/** Mengunggah ke bucket "study-files" di folder milik pengguna dengan nama acak. */
export async function uploadStudyFile(supabase: SupabaseClient, userId: string, file: File, allowed: string[]): Promise<UploadResult> {
  if (!allowed.includes(file.type)) return { ok: false, error: "Jenis file tidak didukung." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Ukuran file maksimal 10 MB." };

  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
  const path = `${userId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from("study-files").upload(path, file, { contentType: file.type });
  if (error) return { ok: false, error: "Gagal mengunggah. Pastikan migrasi 0002 sudah dijalankan di Supabase." };

  const { data } = supabase.storage.from("study-files").getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path, name: file.name, size: file.size };
}
