-- Run-up tasks you've ticked as done.
--
-- The run-up itself (the days, their tasks, the tests and their targets)
-- comes from <pin>/runup.json, which the sync writes from the study
-- folder. A row here only names a task by the id that file gives it, so
-- ticking on the phone shows on the Mac and an unticked task can carry to
-- the next day. Ticking inserts a row, unticking deletes it.

create table if not exists plan_ticks (
  device_id text not null,
  task_id text not null,
  done_at timestamptz not null default now(),
  primary key (device_id, task_id)
);

alter table plan_ticks enable row level security;

drop policy if exists "plan_ticks_owner" on plan_ticks;
create policy "plan_ticks_owner" on plan_ticks
  for all to authenticated
  using (owns_device(device_id))
  with check (owns_device(device_id));

-- Live across devices, like the other tables the app watches.
do $$
begin
  alter publication supabase_realtime add table plan_ticks;
exception when duplicate_object then null;
end $$;
