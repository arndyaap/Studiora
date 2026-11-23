-- =========================================================
-- STUDIORA Phase 2: Learning Management
-- =========================================================

-- Helper: otomatis update kolom updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- CATEGORIES ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  icon text,
  color text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- SUBJECTS ----------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, name)
);

-- ---------- MODULES ----------
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, name)
);

-- ---------- LESSONS ----------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  objectives text,                          -- learning objectives
  content jsonb,                            -- isi editor (mis. Tiptap JSON)
  external_refs jsonb not null default '[]'::jsonb,  -- [{title, url}]
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','completed')),
  bookmarked boolean not null default false,
  completed_at timestamptz,                 -- diisi saat pertama kali completed
  xp_awarded boolean not null default false, -- anti XP farming (dipakai Phase 3)
  last_opened_at timestamptz,               -- untuk "Continue Learning"
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Isi completed_at otomatis saat status pertama kali jadi completed
create or replace function public.lessons_set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists lessons_completed_at on public.lessons;
create trigger lessons_completed_at
  before insert or update on public.lessons
  for each row execute function public.lessons_set_completed_at();

-- ---------- LESSON NOTES ----------
create table if not exists public.lesson_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  content text not null default '',
  is_completed boolean not null default false,
  xp_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- LESSON ATTACHMENTS ----------
create table if not exists public.lesson_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  file_path text not null,                  -- path di Storage bucket
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- ---------- CALENDAR EVENTS ----------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  category text not null default 'study_session'
    check (category in ('study_session','assignment','examination','personal_goal','review_material')),
  start_at timestamptz not null,
  end_at timestamptz,
  deadline_at timestamptz,
  reminder_minutes int check (reminder_minutes is null or reminder_minutes >= 0),
  is_done boolean not null default false,
  completed_at timestamptz,
  lesson_id uuid references public.lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

-- ---------- LIBRARY ITEMS ----------
create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  category text not null default 'learning_resource'
    check (category in ('ebook','article','research_paper','website_reference',
                        'learning_resource','saved_material','favorite_link')),
  url text,
  file_path text,                           -- path di Storage bucket (opsional)
  file_name text,
  tags text[] not null default '{}',
  bookmarked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- QUICK NOTES ----------
create table if not exists public.quick_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  content text not null default '',
  category text,
  tags text[] not null default '{}',
  converted_lesson_id uuid references public.lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index if not exists idx_categories_user on public.categories(user_id);
create index if not exists idx_subjects_user on public.subjects(user_id);
create index if not exists idx_subjects_category on public.subjects(category_id);
create index if not exists idx_modules_user on public.modules(user_id);
create index if not exists idx_modules_subject on public.modules(subject_id);
create index if not exists idx_lessons_user on public.lessons(user_id);
create index if not exists idx_lessons_module on public.lessons(module_id);
create index if not exists idx_lessons_status on public.lessons(user_id, status);
create index if not exists idx_lesson_notes_lesson on public.lesson_notes(lesson_id);
create index if not exists idx_lesson_notes_user on public.lesson_notes(user_id);
create index if not exists idx_attachments_lesson on public.lesson_attachments(lesson_id);
create index if not exists idx_attachments_user on public.lesson_attachments(user_id);
create index if not exists idx_events_user_start on public.calendar_events(user_id, start_at);
create index if not exists idx_events_lesson on public.calendar_events(lesson_id);
create index if not exists idx_library_user on public.library_items(user_id);
create index if not exists idx_library_tags on public.library_items using gin(tags);
create index if not exists idx_quicknotes_user on public.quick_notes(user_id);
create index if not exists idx_quicknotes_tags on public.quick_notes using gin(tags);
create index if not exists idx_quicknotes_lesson on public.quick_notes(converted_lesson_id);

-- ---------- UPDATED_AT TRIGGERS ----------
do $$
declare t text;
begin
  foreach t in array array['categories','subjects','modules','lessons','lesson_notes',
                           'calendar_events','library_items','quick_notes']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.categories         enable row level security;
alter table public.subjects           enable row level security;
alter table public.modules            enable row level security;
alter table public.lessons            enable row level security;
alter table public.lesson_notes       enable row level security;
alter table public.lesson_attachments enable row level security;
alter table public.calendar_events    enable row level security;
alter table public.library_items      enable row level security;
alter table public.quick_notes        enable row level security;

-- Tabel tanpa induk: cukup cek pemilik
do $$
declare t text;
begin
  foreach t in array array['categories','calendar_events','library_items','quick_notes']
  loop
    execute format('drop policy if exists "%1$s_owner" on public.%1$I', t);
    execute format(
      'create policy "%1$s_owner" on public.%1$I
         for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Tabel berinduk: pemilik + induknya juga harus milik user yang sama
drop policy if exists "subjects_owner" on public.subjects;
create policy "subjects_owner" on public.subjects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.categories c
                where c.id = category_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "modules_owner" on public.modules;
create policy "modules_owner" on public.modules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.subjects s
                where s.id = subject_id and s.user_id = (select auth.uid()))
  );

drop policy if exists "lessons_owner" on public.lessons;
create policy "lessons_owner" on public.lessons
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.modules m
                where m.id = module_id and m.user_id = (select auth.uid()))
  );

drop policy if exists "lesson_notes_owner" on public.lesson_notes;
create policy "lesson_notes_owner" on public.lesson_notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.lessons l
                where l.id = lesson_id and l.user_id = (select auth.uid()))
  );

drop policy if exists "lesson_attachments_owner" on public.lesson_attachments;
create policy "lesson_attachments_owner" on public.lesson_attachments
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.lessons l
                where l.id = lesson_id and l.user_id = (select auth.uid()))
  );

-- ---------- STORAGE (bucket privat) ----------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- File harus disimpan di folder bernama user id: <user_id>/nama-file.ext
drop policy if exists "attachments_select_own" on storage.objects;
create policy "attachments_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments_insert_own" on storage.objects;
create policy "attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments_update_own" on storage.objects;
create policy "attachments_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments_delete_own" on storage.objects;
create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments'
         and (storage.foldername(name))[1] = (select auth.uid())::text);