-- =====================================================================
-- STUDIORA — skema database awal (Supabase / PostgreSQL)
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- Aplikasi ini untuk SATU pengguna. Matikan pendaftaran publik:
--   Authentication -> Sign In / Providers -> nonaktifkan "Allow new users to sign up"
-- lalu buat akun Anda lewat Authentication -> Users -> Add user.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Profil (1 baris per pengguna) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default 'Scholar',
  email text,
  bio text not null default '',
  avatar_url text,
  total_xp integer not null default 0 check (total_xp >= 0),
  available_xp integer not null default 0 check (available_xp >= 0),
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_study_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light')),
  skip_welcome boolean not null default false,
  daily_goal_minutes integer not null default 60 check (daily_goal_minutes between 5 and 1440),
  weekly_goal_minutes integer not null default 420 check (weekly_goal_minutes between 5 and 10080),
  notifications_enabled boolean not null default true,
  pomodoro_focus integer not null default 25,
  pomodoro_short_break integer not null default 5,
  pomodoro_long_break integer not null default 15,
  updated_at timestamptz not null default now()
);

-- ---------- Knowledge Center: Category -> Subject -> Module -> Lesson ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  icon text,
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  objectives text[] not null default '{}',
  content_html text not null default '',
  external_refs jsonb not null default '[]',
  attachments jsonb not null default '[]',
  bookmarked boolean not null default false,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  completed_at timestamptz,
  last_opened_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  body text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Kalender ----------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  category text not null default 'study_session'
    check (category in ('study_session','assignment','examination','personal_goal','review_material')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_deadline boolean not null default false,
  remind_minutes_before integer,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index calendar_events_user_start on public.calendar_events (user_id, starts_at);

-- ---------- Misi & Quiz ----------
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('daily','weekly','quiz','challenge','boss')),
  title text not null,
  description text not null default '',
  difficulty text check (difficulty in ('easy','medium','hard','expert')),
  target_value integer not null default 1,
  progress_value integer not null default 0,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  source_lesson_id uuid references public.lessons(id) on delete set null,
  source_category_id uuid references public.categories(id) on delete set null,
  period_key text, -- mis. '2026-11-19' (daily) atau '2026-W47' (weekly) agar tidak dobel
  status text not null default 'active' check (status in ('active','completed','expired')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index missions_period_unique on public.missions (user_id, type, title, period_key)
  where period_key is not null;

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lesson_id uuid references public.lessons(id) on delete cascade,
  type text not null check (type in ('multiple_choice','true_false','short_answer','matching')),
  prompt text not null,
  options jsonb not null default '[]',
  answer jsonb not null,
  explanation text not null default '',
  difficulty text not null default 'easy' check (difficulty in ('easy','medium','hard','expert')),
  source text not null default 'manual' check (source in ('manual','ai')),
  created_at timestamptz not null default now()
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  mission_id uuid references public.missions(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  total_questions integer not null check (total_questions > 0),
  correct_answers integer not null check (correct_answers >= 0),
  score_percent numeric(5,2) not null,
  difficulty text,
  time_limit_seconds integer,
  duration_seconds integer,
  answers jsonb not null default '[]',
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Focus Room ----------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  mode text not null default 'pomodoro' check (mode in ('pomodoro','stopwatch')),
  lesson_id uuid references public.lessons(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index study_sessions_user_start on public.study_sessions (user_id, started_at);

-- ---------- XP & Level ----------
create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  amount integer not null check (amount <> 0),
  kind text not null check (kind in ('earn','spend')),
  source text not null, -- mis. 'lesson_completed', 'quiz', 'study_30min', 'reward_redeemed'
  source_id uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);
-- Anti-farming: satu sumber (mis. lesson tertentu) hanya boleh memberi XP 'earn' sekali.
create unique index xp_once_per_source on public.xp_transactions (user_id, source, source_id)
  where kind = 'earn' and source_id is not null and source in ('lesson_completed','lesson_note_completed');

create table public.user_levels (
  level integer primary key check (level between 1 and 10),
  title text not null,
  min_xp integer not null
);
insert into public.user_levels (level, title, min_xp) values
  (1,'Beginner',0),(2,'Learner',100),(3,'Apprentice',250),(4,'Explorer',500),(5,'Scholar',850),
  (6,'Advanced Scholar',1300),(7,'Expert',1900),(8,'Master',2700),(9,'Grandmaster',3700),(10,'Legendary Scholar',5000);

-- Menjaga total_xp / available_xp selalu konsisten dengan buku besar xp_transactions.
create or replace function public.apply_xp_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'earn' then
    update public.profiles
       set total_xp = total_xp + new.amount,
           available_xp = available_xp + new.amount
     where id = new.user_id;
  else
    -- 'spend' hanya mengurangi available_xp; total_xp (untuk level) tidak berkurang.
    update public.profiles
       set available_xp = available_xp - abs(new.amount)
     where id = new.user_id;
  end if;
  return new;
end $$;

create trigger trg_apply_xp after insert on public.xp_transactions
  for each row execute function public.apply_xp_transaction();

-- ---------- Reward Shop ----------
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  cost_xp integer not null check (cost_xp > 0),
  image_url text,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  reward_id uuid references public.rewards(id) on delete set null,
  reward_name text not null,
  cost_xp integer not null,
  created_at timestamptz not null default now()
);

-- Penukaran reward dalam satu transaksi atomik (baris profil dikunci agar tidak balapan).
create or replace function public.redeem_reward(p_reward_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_reward public.rewards%rowtype;
  v_available integer;
  v_tx uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_reward from public.rewards where id = p_reward_id and user_id = v_user;
  if not found then raise exception 'Reward tidak ditemukan'; end if;
  if not v_reward.available then raise exception 'Reward sedang tidak tersedia'; end if;

  select available_xp into v_available from public.profiles where id = v_user for update;
  if v_available < v_reward.cost_xp then raise exception 'Available XP tidak cukup'; end if;

  insert into public.xp_transactions (user_id, amount, kind, source, source_id, note)
    values (v_user, v_reward.cost_xp, 'spend', 'reward_redeemed', v_reward.id, v_reward.name);

  insert into public.reward_transactions (user_id, reward_id, reward_name, cost_xp)
    values (v_user, v_reward.id, v_reward.name, v_reward.cost_xp)
    returning id into v_tx;

  return v_tx;
end $$;

-- ---------- Achievements ----------
create table public.achievements (
  code text primary key,
  title text not null,
  description text not null,
  icon text not null default 'award'
);
insert into public.achievements (code, title, description, icon) values
  ('first_step','First Step','Menyelesaikan materi pertama','footprints'),
  ('knowledge_seeker','Knowledge Seeker','Menyelesaikan 10 materi','book-open'),
  ('quiz_master','Quiz Master','Mendapatkan nilai sempurna pada quiz','target'),
  ('consistency','Consistency','Belajar 7 hari berturut-turut','flame'),
  ('dedicated_scholar','Dedicated Scholar','Belajar 30 hari berturut-turut','medal'),
  ('explorer','Explorer','Menyelesaikan materi dari 5 kategori','compass'),
  ('grand_scholar','Grand Scholar','Mencapai level 10','crown');

create table public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  achievement_code text not null references public.achievements(code) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_code)
);

-- ---------- Library & Quick Notes ----------
create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null default 'website'
    check (kind in ('ebook','article','paper','website','resource','saved','favorite_link')),
  title text not null check (char_length(title) between 1 and 200),
  url text,
  file_path text,
  description text not null default '',
  bookmarked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.quick_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null default '',
  body text not null default '',
  category text,
  tags text[] not null default '{}',
  converted_lesson_id uuid references public.lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Notifikasi ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('schedule','deadline','mission','achievement','level_up','reward')),
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_created on public.notifications (user_id, created_at desc);

-- ---------- updated_at triggers ----------
create trigger t_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger t_settings_updated before update on public.user_settings for each row execute function public.set_updated_at();
create trigger t_lessons_updated before update on public.lessons for each row execute function public.set_updated_at();
create trigger t_notes_updated before update on public.lesson_notes for each row execute function public.set_updated_at();
create trigger t_events_updated before update on public.calendar_events for each row execute function public.set_updated_at();
create trigger t_quick_updated before update on public.quick_notes for each row execute function public.set_updated_at();

-- ---------- Buat profil + pengaturan otomatis saat akun dibuat ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
    values (new.id, new.email, coalesce(split_part(new.email, '@', 1), 'Scholar'));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security: setiap baris hanya bisa diakses pemiliknya.
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.categories enable row level security;
alter table public.subjects enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_notes enable row level security;
alter table public.calendar_events enable row level security;
alter table public.missions enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.study_sessions enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.library_items enable row level security;
alter table public.quick_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.user_levels enable row level security;
alter table public.achievements enable row level security;

-- Tabel referensi: hanya baca untuk pengguna yang login.
create policy "levels readable" on public.user_levels for select to authenticated using (true);
create policy "achievements readable" on public.achievements for select to authenticated using (true);

-- Profil & pengaturan: baca dan ubah milik sendiri. Insert dilakukan trigger (security definer).
create policy "profile select own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profile update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "settings select own" on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy "settings update own" on public.user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tabel data pengguna: CRUD penuh atas baris milik sendiri.
do $$
declare t text;
begin
  foreach t in array array[
    'categories','subjects','modules','lessons','lesson_notes','calendar_events','missions',
    'quiz_questions','quiz_attempts','study_sessions','rewards','library_items','quick_notes','notifications'
  ] loop
    execute format('create policy "%1$s select own" on public.%1$s for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "%1$s insert own" on public.%1$s for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s update own" on public.%1$s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s delete own" on public.%1$s for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- Buku besar XP & riwayat penukaran: tambah-saja (tidak bisa diubah/dihapus dari klien).
create policy "xp select own" on public.xp_transactions for select to authenticated using (user_id = auth.uid());
create policy "xp insert own" on public.xp_transactions for insert to authenticated with check (user_id = auth.uid());
create policy "reward_tx select own" on public.reward_transactions for select to authenticated using (user_id = auth.uid());
create policy "reward_tx insert own" on public.reward_transactions for insert to authenticated with check (user_id = auth.uid());

create policy "user_ach select own" on public.user_achievements for select to authenticated using (user_id = auth.uid());
create policy "user_ach insert own" on public.user_achievements for insert to authenticated with check (user_id = auth.uid());

-- Kolom XP pada profil tidak boleh diubah langsung dari klien (hanya lewat trigger xp_transactions).
revoke update on public.profiles from authenticated;
grant update (username, display_name, email, bio, avatar_url, current_streak, longest_streak, last_study_date)
  on public.profiles to authenticated;

-- ---------- Storage: avatar ----------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy "avatar read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
