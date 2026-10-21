-- Columns the app has always read as set become NOT NULL, so the schema
-- says so too, and the typed client (src/lib/database.ts) checks the app
-- against it. The live project held no null in any of them. A null would
-- take the column's default; a slot, class or mark with no subject, which
-- nothing in the app can show, is dropped.

update settings set
  semester = coalesce(semester, 3),
  target_sgpa = coalesce(target_sgpa, 8.5),
  min_attendance = coalesce(min_attendance, 75),
  current_day_order = coalesce(current_day_order, 1),
  declared_holidays = coalesce(declared_holidays, '[]')
where semester is null or target_sgpa is null or min_attendance is null or current_day_order is null or declared_holidays is null;
alter table settings
  alter column semester set not null,
  alter column target_sgpa set not null,
  alter column min_attendance set not null,
  alter column current_day_order set not null,
  alter column declared_holidays set not null;

update subjects set color_hex = coalesce(color_hex, '#7c6af7'), created_at = coalesce(created_at, now())
where color_hex is null or created_at is null;
alter table subjects
  alter column color_hex set not null,
  alter column created_at set not null;

delete from timetable_slots where subject_id is null;
update timetable_slots set created_at = now() where created_at is null;
alter table timetable_slots
  alter column subject_id set not null,
  alter column created_at set not null;

delete from attendance where subject_id is null;
alter table attendance alter column subject_id set not null;

delete from marks where subject_id is null;
update marks set added_at = now() where added_at is null;
alter table marks
  alter column subject_id set not null,
  alter column added_at set not null;

update deadlines set created_at = now() where created_at is null;
alter table deadlines alter column created_at set not null;

update semester_archives set archived_at = now() where archived_at is null;
alter table semester_archives alter column archived_at set not null;
