-- STUDIORA: Materi otomatis dari Library (analisis AI).
-- Aman dijalankan berulang. Jalankan di Supabase -> SQL Editor.

create table if not exists public.material_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','failed','applied')),
  error_message text,
  extracted_chars integer not null default 0,
  truncated boolean not null default false,
  chunk_count integer not null default 0,
  chunks_done integer not null default 0,
  source_text text not null default '',
  proposal jsonb not null default '{}'::jsonb,
  applied_subject_id uuid references public.subjects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists material_imports_item on public.material_imports (user_id, library_item_id, created_at desc);

alter table public.lessons add column if not exists source_library_item_id uuid references public.library_items(id) on delete set null;
alter table public.lessons add column if not exists estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 1440);
alter table public.calendar_events add column if not exists lesson_id uuid references public.lessons(id) on delete set null;

drop trigger if exists t_imports_updated on public.material_imports;
create trigger t_imports_updated before update on public.material_imports
  for each row execute function public.set_updated_at();

alter table public.material_imports enable row level security;

drop policy if exists "material_imports select own" on public.material_imports;
drop policy if exists "material_imports insert own" on public.material_imports;
drop policy if exists "material_imports update own" on public.material_imports;
drop policy if exists "material_imports delete own" on public.material_imports;
create policy "material_imports select own" on public.material_imports for select to authenticated using (user_id = auth.uid());
create policy "material_imports insert own" on public.material_imports for insert to authenticated with check (user_id = auth.uid());
create policy "material_imports update own" on public.material_imports for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "material_imports delete own" on public.material_imports for delete to authenticated using (user_id = auth.uid());
