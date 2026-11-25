-- =====================================================================
-- STUDIORA Phase 3: Misi, Quiz, XP aman, Reward Shop, Achievements
-- Aman dijalankan ulang (idempotent). Jalankan SETELAH 0001, 0002, 0003.
-- Ide utama: semua pemberian XP dan achievement dipindah ke fungsi database,
-- sehingga browser tidak bisa lagi menulis XP/achievement sembarangan.
-- =====================================================================

-- ---------- Kolom tambahan misi ----------
alter table public.missions add column if not exists metric text not null default 'lessons_completed';
alter table public.missions add column if not exists window_start timestamptz;
alter table public.missions add column if not exists window_end timestamptz;

alter table public.missions drop constraint if exists missions_metric_check;
alter table public.missions add constraint missions_metric_check
  check (metric in ('lessons_completed','notes_completed','quizzes_taken','quiz_perfect'));
alter table public.missions drop constraint if exists missions_target_check;
alter table public.missions add constraint missions_target_check check (target_value between 1 and 100);

-- XP dari misi hanya sekali per misi
create unique index if not exists xp_once_mission on public.xp_transactions (user_id, source, source_id)
  where kind = 'earn' and source = 'mission_completed' and source_id is not null;

-- ---------- Penjaga insert misi dari browser ----------
-- Misi harian/mingguan dibuat sistem. Dari browser hanya boleh membuat challenge/boss/quiz,
-- dengan batas XP, dan status/progress tidak bisa diatur sendiri.
create or replace function public.missions_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_cap integer;
begin
  if current_user = 'authenticated' then
    if new.type not in ('challenge','boss','quiz') then
      raise exception 'Misi harian dan mingguan dibuat otomatis oleh sistem';
    end if;
    v_cap := case new.type when 'boss' then 300 when 'challenge' then 150 else 100 end;
    if new.xp_reward > v_cap then
      raise exception 'XP misi melebihi batas untuk jenis ini';
    end if;
    new.period_key := null;
    new.status := 'active';
    new.progress_value := 0;
    new.completed_at := null;
    new.window_start := now();
    new.window_end := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_missions_guard on public.missions;
create trigger trg_missions_guard before insert on public.missions
  for each row execute function public.missions_guard();

-- Dari browser hanya judul dan deskripsi misi yang boleh diubah.
revoke update on public.missions from authenticated;
grant update (title, description) on public.missions to authenticated;

-- ---------- Tutup jalur tulis langsung dari browser ----------
drop policy if exists "xp insert own" on public.xp_transactions;
revoke insert, update, delete on public.xp_transactions from authenticated;

drop policy if exists "reward_tx insert own" on public.reward_transactions;
revoke insert, update, delete on public.reward_transactions from authenticated;

drop policy if exists "user_ach insert own" on public.user_achievements;
revoke insert, update, delete on public.user_achievements from authenticated;

revoke insert, update, delete on public.quiz_attempts from authenticated;
drop policy if exists "quiz_attempts insert own" on public.quiz_attempts;
drop policy if exists "quiz_attempts update own" on public.quiz_attempts;
drop policy if exists "quiz_attempts delete own" on public.quiz_attempts;

-- ---------- XP materi dan catatan ----------
create or replace function public.award_lesson_xp(p_lesson_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_title text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select title into v_title from public.lessons
   where id = p_lesson_id and user_id = v_user and status = 'completed';
  if not found then return 0; end if;
  begin
    insert into public.xp_transactions (user_id, amount, kind, source, source_id, note)
      values (v_user, 20, 'earn', 'lesson_completed', p_lesson_id, 'Materi selesai: ' || v_title);
  exception when unique_violation then
    return 0;
  end;
  return 20;
end $$;

create or replace function public.award_note_xp(p_lesson_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.lesson_notes
                  where lesson_id = p_lesson_id and user_id = v_user and completed and char_length(trim(body)) > 0) then
    return 0;
  end if;
  begin
    insert into public.xp_transactions (user_id, amount, kind, source, source_id, note)
      values (v_user, 10, 'earn', 'lesson_note_completed', p_lesson_id, 'Catatan pribadi selesai');
  exception when unique_violation then
    return 0;
  end;
  return 10;
end $$;

-- ---------- Penilaian quiz ----------
create or replace function public.quiz_is_correct(q public.quiz_questions, a jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare v_given text; v_ok boolean := false; v_item jsonb;
begin
  if a is null or a = 'null'::jsonb then return false; end if;
  if q.type = 'short_answer' then
    v_given := lower(trim(a #>> '{}'));
    if v_given = '' then return false; end if;
    if jsonb_typeof(q.answer) = 'array' then
      for v_item in select * from jsonb_array_elements(q.answer) loop
        if lower(trim(v_item #>> '{}')) = v_given then v_ok := true; end if;
      end loop;
      return v_ok;
    end if;
    return lower(trim(q.answer #>> '{}')) = v_given;
  end if;
  return a = q.answer;
end $$;

-- p_answers: [{"question_id":"uuid","answer":...}, ...]
create or replace function public.submit_quiz(
  p_lesson_id uuid,
  p_answers jsonb,
  p_duration integer default null,
  p_tz text default 'Asia/Jakarta'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_tz text;
  v_total int; v_distinct int; v_correct int := 0;
  v_item jsonb; v_q public.quiz_questions; v_ok boolean;
  v_results jsonb := '[]'::jsonb;
  v_attempt uuid;
  v_xp int := 0; v_day_start timestamptz; v_given_today int; v_quiz_today int;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then raise exception 'Jawaban tidak valid'; end if;
  v_total := jsonb_array_length(p_answers);
  if v_total < 1 or v_total > 50 then raise exception 'Jumlah soal harus 1 sampai 50'; end if;
  select count(distinct e->>'question_id') into v_distinct from jsonb_array_elements(p_answers) e;
  if v_distinct <> v_total then raise exception 'Soal tidak boleh dobel'; end if;

  begin perform now() at time zone p_tz; v_tz := p_tz; exception when others then v_tz := 'Asia/Jakarta'; end;
  v_day_start := ((now() at time zone v_tz)::date)::timestamp at time zone v_tz;

  for v_item in select * from jsonb_array_elements(p_answers) loop
    select * into v_q from public.quiz_questions
     where id = (v_item->>'question_id')::uuid and user_id = v_user;
    if not found then raise exception 'Soal tidak ditemukan'; end if;
    v_ok := public.quiz_is_correct(v_q, v_item->'answer');
    if v_ok then v_correct := v_correct + 1; end if;
    v_results := v_results || jsonb_build_object(
      'question_id', v_q.id, 'correct', v_ok, 'correct_answer', v_q.answer, 'explanation', v_q.explanation);
  end loop;

  insert into public.quiz_attempts (user_id, lesson_id, total_questions, correct_answers, score_percent,
                                    duration_seconds, answers)
    values (v_user, p_lesson_id, v_total, v_correct, round(v_correct * 100.0 / v_total, 2),
            greatest(p_duration, 0), v_results)
    returning id into v_attempt;

  -- XP: 2 per jawaban benar (maks 40), bonus 10 untuk nilai sempurna (min. 3 soal).
  -- Hanya satu attempt per lesson (atau campuran) per hari yang memberi XP, dan maks 100 XP quiz per hari.
  select count(*) into v_given_today from public.quiz_attempts
   where user_id = v_user and created_at >= v_day_start and xp_awarded > 0
     and lesson_id is not distinct from p_lesson_id;
  select coalesce(sum(amount), 0) into v_quiz_today from public.xp_transactions
   where user_id = v_user and source = 'quiz_attempt' and created_at >= v_day_start;

  if v_given_today = 0 then
    v_xp := least(v_correct * 2, 40) + case when v_correct = v_total and v_total >= 3 then 10 else 0 end;
    v_xp := least(v_xp, greatest(0, 100 - v_quiz_today));
  end if;

  if v_xp > 0 then
    insert into public.xp_transactions (user_id, amount, kind, source, source_id, note)
      values (v_user, v_xp, 'earn', 'quiz_attempt', v_attempt, 'Quiz: ' || v_correct || '/' || v_total || ' benar');
    update public.quiz_attempts set xp_awarded = v_xp where id = v_attempt;
  end if;

  return jsonb_build_object('attempt_id', v_attempt, 'total', v_total, 'correct', v_correct,
    'score', round(v_correct * 100.0 / v_total, 0), 'xp', v_xp, 'results', v_results);
end $$;

-- ---------- Misi: buat misi periodik, hitung progres, beri XP ----------
create or replace function public.sync_missions(p_tz text default 'Asia/Jakarta')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_tz text;
  v_local date;
  v_day_start timestamptz; v_week_start timestamptz;
  v_dkey text; v_wkey text;
  m public.missions;
  v_count int; v_award int; v_today_xp int;
  v_done jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  begin perform now() at time zone p_tz; v_tz := p_tz; exception when others then v_tz := 'Asia/Jakarta'; end;

  v_local := (now() at time zone v_tz)::date;
  v_day_start := v_local::timestamp at time zone v_tz;
  v_week_start := date_trunc('week', v_local::timestamp)::timestamp at time zone v_tz;
  v_dkey := to_char(v_local, 'YYYY-MM-DD');
  v_wkey := to_char(v_local, 'IYYY"-W"IW');

  -- Misi harian
  insert into public.missions (user_id, type, title, description, difficulty, target_value, xp_reward, metric, period_key, window_start, window_end)
  values
    (v_user, 'daily', 'Selesaikan 1 materi', 'Tandai satu lesson sebagai selesai hari ini.', 'easy', 1, 10, 'lessons_completed', v_dkey, v_day_start, v_day_start + interval '1 day'),
    (v_user, 'daily', 'Kerjakan 1 quiz', 'Selesaikan satu sesi quiz hari ini.', 'easy', 1, 10, 'quizzes_taken', v_dkey, v_day_start, v_day_start + interval '1 day')
  on conflict (user_id, type, title, period_key) where period_key is not null do nothing;

  -- Misi mingguan
  insert into public.missions (user_id, type, title, description, difficulty, target_value, xp_reward, metric, period_key, window_start, window_end)
  values
    (v_user, 'weekly', 'Selesaikan 5 materi', 'Tandai lima lesson selesai minggu ini.', 'medium', 5, 40, 'lessons_completed', v_wkey, v_week_start, v_week_start + interval '7 days'),
    (v_user, 'weekly', 'Kerjakan 3 quiz', 'Selesaikan tiga sesi quiz minggu ini.', 'medium', 3, 30, 'quizzes_taken', v_wkey, v_week_start, v_week_start + interval '7 days'),
    (v_user, 'weekly', 'Selesaikan 3 catatan', 'Tandai tiga catatan pribadi selesai minggu ini.', 'easy', 3, 20, 'notes_completed', v_wkey, v_week_start, v_week_start + interval '7 days')
  on conflict (user_id, type, title, period_key) where period_key is not null do nothing;

  -- Hitung progres semua misi aktif
  for m in select * from public.missions where user_id = v_user and status = 'active' for update loop
    if m.metric = 'lessons_completed' then
      select count(*) into v_count from public.lessons l
        join public.modules mo on mo.id = l.module_id
        join public.subjects s on s.id = mo.subject_id
       where l.user_id = v_user and l.status = 'completed'
         and l.completed_at >= m.window_start and (m.window_end is null or l.completed_at < m.window_end)
         and (m.source_category_id is null or s.category_id = m.source_category_id);
    elsif m.metric = 'notes_completed' then
      select count(*) into v_count from public.lesson_notes n
       where n.user_id = v_user and n.completed
         and n.updated_at >= m.window_start and (m.window_end is null or n.updated_at < m.window_end);
    else
      select count(*) into v_count from public.quiz_attempts a
       where a.user_id = v_user
         and a.created_at >= m.window_start and (m.window_end is null or a.created_at < m.window_end)
         and (m.metric <> 'quiz_perfect' or (a.correct_answers = a.total_questions and a.total_questions >= 3))
         and (m.source_category_id is null or exists (
               select 1 from public.lessons l
                 join public.modules mo on mo.id = l.module_id
                 join public.subjects s on s.id = mo.subject_id
                where l.id = a.lesson_id and s.category_id = m.source_category_id));
    end if;

    if v_count >= m.target_value then
      update public.missions set progress_value = target_value, status = 'completed', completed_at = now() where id = m.id;
      -- maks 300 XP dari misi per hari (mencegah membuat misi berulang hanya untuk XP)
      select coalesce(sum(amount), 0) into v_today_xp from public.xp_transactions
       where user_id = v_user and source = 'mission_completed' and created_at >= v_day_start;
      v_award := least(m.xp_reward, greatest(0, 300 - v_today_xp));
      if v_award > 0 then
        insert into public.xp_transactions (user_id, amount, kind, source, source_id, note)
          values (v_user, v_award, 'earn', 'mission_completed', m.id, 'Misi selesai: ' || m.title);
      end if;
      insert into public.notifications (user_id, type, title, body)
        values (v_user, 'mission', 'Misi selesai: ' || m.title, case when v_award > 0 then '+' || v_award || ' XP' else 'Batas XP misi harian tercapai' end);
      v_done := v_done || jsonb_build_object('id', m.id, 'title', m.title, 'xp', v_award);
    elsif v_count <> m.progress_value then
      update public.missions set progress_value = v_count where id = m.id;
    end if;
  end loop;

  -- Misi yang jendelanya sudah lewat dan belum tercapai menjadi kedaluwarsa
  update public.missions set status = 'expired'
   where user_id = v_user and status = 'active' and window_end is not null and window_end <= now();

  return jsonb_build_object('completed', v_done);
end $$;

-- ---------- Achievements ----------
create or replace function public.check_achievements()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_lessons int; v_cats int; v_xp int; v_longest int; v_perfect boolean;
  v_code text; v_title text; v_n int;
  v_new jsonb := '[]'::jsonb;
  v_codes text[] := '{}';
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select count(*), count(distinct s.category_id) into v_lessons, v_cats
    from public.lessons l
    join public.modules mo on mo.id = l.module_id
    join public.subjects s on s.id = mo.subject_id
   where l.user_id = v_user and l.status = 'completed';
  select total_xp, longest_streak into v_xp, v_longest from public.profiles where id = v_user;
  select exists (select 1 from public.quiz_attempts
                  where user_id = v_user and correct_answers = total_questions and total_questions >= 3) into v_perfect;

  if v_lessons >= 1 then v_codes := array_append(v_codes, 'first_step'); end if;
  if v_lessons >= 10 then v_codes := array_append(v_codes, 'knowledge_seeker'); end if;
  if v_cats >= 5 then v_codes := array_append(v_codes, 'explorer'); end if;
  if v_xp >= 5000 then v_codes := array_append(v_codes, 'grand_scholar'); end if;
  if v_perfect then v_codes := array_append(v_codes, 'quiz_master'); end if;
  if coalesce(v_longest, 0) >= 7 then v_codes := array_append(v_codes, 'consistency'); end if;
  if coalesce(v_longest, 0) >= 30 then v_codes := array_append(v_codes, 'dedicated_scholar'); end if;

  foreach v_code in array v_codes loop
    insert into public.user_achievements (user_id, achievement_code) values (v_user, v_code)
      on conflict (user_id, achievement_code) do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      select title into v_title from public.achievements where code = v_code;
      insert into public.notifications (user_id, type, title, body)
        values (v_user, 'achievement', 'Achievement terbuka: ' || coalesce(v_title, v_code), '');
      v_new := v_new || jsonb_build_object('code', v_code, 'title', coalesce(v_title, v_code));
    end if;
  end loop;
  return v_new;
end $$;

-- ---------- Reward Shop ----------
-- Dibuat ulang sebagai security definer karena browser tidak lagi boleh menulis xp_transactions langsung.
create or replace function public.redeem_reward(p_reward_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
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

  insert into public.notifications (user_id, type, title, body)
    values (v_user, 'reward', 'Reward ditukar: ' || v_reward.name, '-' || v_reward.cost_xp || ' XP');

  return v_tx;
end $$;

-- ---------- Hak eksekusi fungsi ----------
revoke all on function public.award_lesson_xp(uuid) from public, anon;
revoke all on function public.award_note_xp(uuid) from public, anon;
revoke all on function public.submit_quiz(uuid, jsonb, integer, text) from public, anon;
revoke all on function public.sync_missions(text) from public, anon;
revoke all on function public.check_achievements() from public, anon;
revoke all on function public.redeem_reward(uuid) from public, anon;
grant execute on function public.award_lesson_xp(uuid) to authenticated;
grant execute on function public.award_note_xp(uuid) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.sync_missions(text) to authenticated;
grant execute on function public.check_achievements() to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
