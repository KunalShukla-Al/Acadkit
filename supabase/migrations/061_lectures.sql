-- Lectures the Mac recorded and transcribed (scripts/lib/recorder.mjs), so
-- the app can show and search what was said. A lecture is the class it was
-- of and the deck it followed; its moments are about a minute of the
-- transcript each, with the slide it was on and a gte-small embedding,
-- the vectors study search uses. The audio never leaves the Mac.

create table if not exists lectures (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  -- The Voice Memos file it came from, kept on the Mac.
  memo text not null,
  date date not null,
  start_time time not null,
  seconds int,
  -- Null when it was out of class hours.
  subject_code text,
  class_start time,
  class_end time,
  -- The study-folder path of the deck it followed; null when none fitted.
  deck text,
  words int not null default 0,
  created_at timestamptz not null default now(),
  unique (device_id, memo)
);

create index if not exists idx_lectures_device_date on lectures(device_id, date desc);

create table if not exists lecture_moments (
  id bigint generated always as identity primary key,
  device_id text not null,
  lecture_id uuid not null references lectures(id) on delete cascade,
  idx int not null,
  start_s real not null,
  end_s real not null,
  content text not null,
  -- The deck's page, as the file viewer numbers it; null for talk off the slides.
  page int,
  similarity real,
  embedding extensions.vector(384),
  unique (lecture_id, idx)
);

create index if not exists idx_lecture_moments_device on lecture_moments(device_id);
create index if not exists idx_lecture_moments_embedding
  on lecture_moments using hnsw (embedding extensions.vector_cosine_ops);

alter table lectures enable row level security;
alter table lecture_moments enable row level security;

-- The app only reads. Writes come from the Mac (service role).
drop policy if exists "lectures_owner_select" on lectures;
create policy "lectures_owner_select" on lectures
  for select to authenticated using (private.owns_device(device_id));
drop policy if exists "lecture_moments_owner_select" on lecture_moments;
create policy "lecture_moments_owner_select" on lecture_moments
  for select to authenticated using (private.owns_device(device_id));

-- The moments nearest to a query embedding, with their lecture. SECURITY
-- INVOKER, as match_study_chunks: another PIN's moments return nothing.
create or replace function match_lecture_moments(
  p_device text,
  query_embedding extensions.vector(384),
  match_count int default 6
)
returns table (
  lecture_id uuid, idx int, start_s real, page int, content text, similarity double precision,
  date date, start_time time, subject_code text, deck text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select m.lecture_id, m.idx, m.start_s, m.page, m.content,
         1 - (m.embedding <=> query_embedding) as similarity,
         l.date, l.start_time, l.subject_code, l.deck
  from lecture_moments m
  join lectures l on l.id = m.lecture_id
  where m.device_id = p_device and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

revoke all on function match_lecture_moments(text, extensions.vector, int) from public, anon;
grant execute on function match_lecture_moments(text, extensions.vector, int) to authenticated;
