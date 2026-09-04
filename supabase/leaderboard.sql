create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_name varchar(20) not null check (char_length(trim(player_name)) between 1 and 20),
  score integer not null check (score between 0 and 10000),
  created_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

revoke all on table public.leaderboard from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select, insert on table public.leaderboard to anon, authenticated;

drop policy if exists "Anyone can read top scores" on public.leaderboard;
create policy "Anyone can read top scores"
on public.leaderboard
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can submit a valid score" on public.leaderboard;
create policy "Anyone can submit a valid score"
on public.leaderboard
for insert
to anon, authenticated
with check (
  char_length(trim(player_name)) between 1 and 20
  and score between 0 and 10000
);

create index if not exists leaderboard_score_rank_idx
on public.leaderboard (score desc, created_at asc);
