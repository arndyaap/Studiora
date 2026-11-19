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
