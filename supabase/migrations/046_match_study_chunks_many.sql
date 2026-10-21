-- Many searches in one call.
--
-- The sync links every syllabus unit and every past-paper topic to the
-- passages nearest it, and asked match_study_chunks (migration 030) once
-- for each: about 250 round trips a build, 123,390 calls since May. This
-- takes a batch of query vectors, as a JSON array of 384-number arrays,
-- and returns each one's nearest passages tagged with its place in the
-- batch (0-based). The passages' text stays behind: the sync only needs
-- where they are. At most 100 queries a call; a bigger batch returns
-- nothing.

create or replace function match_study_chunks_many(
  p_device text,
  query_embeddings jsonb,
  match_count int default 12
)
returns table (query_index int, file_key text, chunk_index int, page int, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select (q.n - 1)::int, m.file_key, m.chunk_index, m.page, m.similarity
  from jsonb_array_elements(query_embeddings) with ordinality as q(vec, n)
  cross join lateral (
    select c.file_key, c.chunk_index, c.page,
           1 - (c.embedding <=> (q.vec::text)::extensions.vector(384)) as similarity
    from study_chunks c
    where c.device_id = p_device
    order by c.embedding <=> (q.vec::text)::extensions.vector(384)
    limit greatest(1, least(match_count, 50))
  ) m
  where jsonb_typeof(query_embeddings) = 'array' and jsonb_array_length(query_embeddings) <= 100;
$$;

revoke all on function match_study_chunks_many(text, jsonb, int) from public, anon;
grant execute on function match_study_chunks_many(text, jsonb, int) to authenticated;
