-- STUDIORA Phase 2: bucket penyimpanan untuk gambar & lampiran materi dan file Library.
-- Jalankan di Supabase -> SQL Editor (sekali saja).
--
-- Catatan privasi: bucket ini bersifat publik-baca agar gambar bisa tampil di dalam materi.
-- Path file memakai UUID acak sehingga tidak bisa ditebak, tetapi siapa pun yang punya
-- link persisnya dapat membukanya. Jangan unggah dokumen yang sangat rahasia.

insert into storage.buckets (id, name, public, file_size_limit)
values ('study-files', 'study-files', true, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy "study-files read" on storage.objects for select
  using (bucket_id = 'study-files');
create policy "study-files insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "study-files update own" on storage.objects for update to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "study-files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text);
