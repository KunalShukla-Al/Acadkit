-- A past paper Autopilot read but isn't sure of (scripts/lib/paper-dataset.mjs)
-- asks on Home before it joins the dataset: a suggestion of its own kind,
-- whose payload holds the reading, so a yes adds it as read.

alter table suggestions drop constraint if exists suggestions_kind_check;
alter table suggestions add constraint suggestions_kind_check check (kind in ('deadline', 'plan', 'paper'));
