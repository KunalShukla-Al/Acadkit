-- Flashcard reviews: where each card stands in your spaced repetition.
--
-- The cards themselves come from <pin>/cards.json, which the sync writes
-- from the study folder. A row here holds one card's Leitner box (1-5) and
-- the day it is next due, keyed by the id that file gives the card, so a
-- card reviewed on the phone is moved on for the Mac too. Not in the
-- realtime publication: a review only has to reach the other device by the
-- next time it opens the deck.

create table if not exists card_reviews (
  device_id text not null,
  card_id text not null,
  box smallint not null check (box between 1 and 5),
  due date not null,
  reviewed_at timestamptz not null default now(),
  primary key (device_id, card_id)
);

alter table card_reviews enable row level security;

drop policy if exists "card_reviews_owner" on card_reviews;
create policy "card_reviews_owner" on card_reviews
  for all to authenticated
  using (owns_device(device_id))
  with check (owns_device(device_id));
