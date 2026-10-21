-- Two of the advisor's findings (18 Oct 2026).
--
-- idx_attendance_auto_marked (migration 013) has never been scanned: clearing
-- auto-marked classes filters on device_id first, which the table's other
-- indexes serve. It goes. The other unused one, idx_timetable_slots_subject,
-- stays: it is the index on timetable_slots' foreign key to subjects (ON DELETE
-- CASCADE), and without it the advisor flags an unindexed foreign key instead.
--
-- pg_net was installed in public ("Extension in Public"). It can't be moved
-- (it isn't relocatable), so it is made again in extensions. Its functions
-- live in its own schema, net, either way: the reminders cron, which calls
-- net.http_post by name, carries on. Nothing else depends on it; what goes is
-- its six-hour log of responses and any request still queued.

drop index if exists idx_attendance_auto_marked;

drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
