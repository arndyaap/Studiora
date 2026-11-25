# STUDIORA — Personal Learning Management System

**LEARN. EXPLORE. EVOLVE.**

Ruang belajar pribadi (satu pengguna). Stack: Next.js 15 (App Router) · Tailwind CSS · Supabase (Postgres, Auth, RLS, Storage) · Lucide.

## Status pembangunan

| Phase | Isi | Status |
|---|---|---|
| 1 | Welcome Screen, Auth, Homepage, Profile, Navigasi, Tema, Database, Settings dasar, Export JSON, PWA dasar | **Selesai** (build & type-check lulus; belum diuji ke Supabase sungguhan) |
| 2 | Kalender, Materi + editor, Library, Quick Notes | Belum |
| 3 | Misi, Quiz, XP, Reward Shop, Achievements | Belum (skema DB & fungsi `redeem_reward` sudah disiapkan) |
| 4 | Progress/Analytics, Focus Room, Streak, Notifikasi | Belum |
| 5 | Import/Backup, optimasi, uji keamanan | Belum |

Halaman yang belum dibangun menampilkan label "Belum dibangun — dijadwalkan di Phase X", bukan data tiruan.

## Setup

1. Buat proyek di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan seluruh isi `supabase/migrations/0001_init.sql`.
3. **Authentication → Sign In / Providers**: matikan *Allow new users to sign up* (tidak ada registrasi publik).
4. **Authentication → Users → Add user**: buat akunmu (email + kata sandi). Buat akun *setelah* migrasi dijalankan agar profil terbentuk otomatis.
5. `cp .env.example .env.local`, isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API). Anon key memang publik; keamanan data dijaga RLS.
6. `npm install && npm run dev`, buka http://localhost:3000.

Tanpa env Supabase, semua halaman diarahkan ke `/setup`.

## Keamanan (Phase 1)

- Semua rute dilindungi middleware (`getUser()` memvalidasi token ke server Auth).
- RLS aktif di semua tabel; setiap baris hanya bisa diakses pemiliknya.
- `total_xp` / `available_xp` hanya berubah lewat trigger dari `xp_transactions`; klien tidak bisa mengubahnya langsung.
- Tidak ada secret key di frontend. `ANTHROPIC_API_KEY` (untuk soal otomatis, Phase 3) nantinya hanya dipakai di server dan **belum aktif**.

### Hal yang perlu diperketat di Phase 3
Saat ini klien yang login boleh `insert` ke `xp_transactions` (diperlukan agar fitur XP bisa jalan tanpa server tambahan). Karena aplikasi ini satu pengguna, risikonya rendah, tetapi di Phase 3 pemberian XP akan dipindahkan ke fungsi database/Server Action dengan validasi aturan (anti-farming, batas quiz ulang).

## Deploy

Vercel atau host Next.js lain. Isi dua env di atas. Untuk akses privat, cukup andalkan login Supabase (pendaftaran sudah dimatikan).

## PWA

`manifest.webmanifest`, ikon (192/512/apple-touch), dan service worker yang hanya men-cache aset statis (data pengguna tidak di-cache). Aktif pada build produksi.

## Fase 2.5 — Materi otomatis dari Library (AI)

Dari item Library (PDF / link / artikel), tekan **Jadikan Materi**. AI membaca isinya dan mengusulkan mata pelajaran, modul, dan lesson. Kamu centang yang mau dipelajari, atur jadwal bila perlu, lalu terapkan.

### Cara pasang
1. **Jalankan migrasi dulu** di Supabase → SQL Editor: isi `supabase/migrations/0003_material_imports.sql`. Lakukan SEBELUM deploy kode (halaman Materi sekarang membaca kolom baru).
2. Buat API key di https://console.anthropic.com → API Keys.
3. Netlify → Environment variables, tambahkan:
   - `ANTHROPIC_API_KEY` = key tadi. **Jangan** diawali `NEXT_PUBLIC_`, dan centang "Contains secret values".
   - (opsional) `AI_MODEL` (default `claude-haiku-5-5`), `CHUNK_CHARS` (default dari kode), `MAX_CHUNKS`.
4. Deploy ulang (Clear cache and deploy).

### Batasan
- PDF hasil scan (berupa gambar) belum didukung; akan muncul pesan jelas.
- Hanya PDF, txt/csv, dan link web (http/https). Link ke alamat internal diblokir.
- AI bisa keliru; hasil selalu ditinjau dulu sebelum disimpan.
- Setiap proses memakai kuota API berbayar (dokumen dipotong per bagian; ada batas jumlah bagian).

## Fase 3 — Misi, Quiz, XP aman, Reward Shop, Achievements

### Cara pasang
1. Supabase → SQL Editor → jalankan `supabase/migrations/0004_phase3_missions_quiz_rewards.sql` SEBELUM deploy kode. Aman dijalankan ulang. Syarat: migrasi 0001–0003 sudah dijalankan.
2. Timpa file dari zip, commit, push, lalu Netlify → Clear cache and deploy.
3. Pembuatan soal dengan AI memakai `ANTHROPIC_API_KEY` yang sama dengan fitur Jadikan Materi.

### Yang berubah di keamanan
Browser tidak bisa lagi menulis XP, achievement, riwayat quiz, dan riwayat penukaran reward secara langsung. Semuanya lewat fungsi database: `award_lesson_xp`, `award_note_xp`, `submit_quiz` (menilai jawaban di server), `sync_missions`, `check_achievements`, `redeem_reward`.

### Aturan XP
- Lesson selesai 20 XP dan catatan selesai 10 XP, masing-masing sekali per lesson.
- Quiz: 2 XP per jawaban benar (maks. 40) + 10 XP bonus nilai sempurna (min. 3 soal). Satu percobaan per materi per hari yang memberi XP, maks. 100 XP quiz per hari.
- Misi: harian (2) dan mingguan (3) dibuat otomatis. Challenge, Boss, dan Quiz bisa kamu buat sendiri; hadiah ditentukan dari jenis dan kesulitan. Maks. 300 XP dari misi per hari.
- Reward hanya mengurangi Available XP, bukan Total XP/Level.

### Batasan
- Tipe soal “matching” belum tersedia (pilihan ganda, benar/salah, isian singkat sudah).
- Achievement Consistency dan Dedicated Scholar menunggu fitur streak di Phase 4.
- Soal buatan AI bisa keliru; periksa dulu.
