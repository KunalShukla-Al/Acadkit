-- send-reminders pushes every reminder itself; jobq (040, 042) is gone.
-- This drops AcadKit's two entry points into it and the schema jobq made
-- on this database: its queue and its own migration history.

drop function if exists public.jobq_enqueue(jsonb);
drop function if exists public.jobq_due();
drop schema if exists jobq cascade;
