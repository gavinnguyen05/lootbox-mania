-- Lootbox Mania: Candy Island. Run after 0001-0009. Safe to run again.
--
-- Elimination draws. Each round the server shuffles everyone still on the
-- island and draws names until the chosen number remain; those left over are
-- out and skip every later round. Rounds can be undone (latest first), and
-- "Start over" begins a new game with everyone back. Admin only.

create table if not exists public.island_meta (
  id      int primary key default 1 check (id = 1),   -- single row
  season  int not null default 1
);
insert into public.island_meta (id, season) values (1, 1) on conflict (id) do nothing;

create table if not exists public.island_rounds (
  id          bigint generated always as identity primary key,
  request_id  uuid not null unique,              -- idempotency key from the admin UI
  season      int not null,
  round       int not null,
  picked      uuid[] not null,                   -- drawn, in order
  remaining   uuid[] not null,                   -- left over: out of the island
  created_at  timestamptz not null default clock_timestamp(),
  undone      boolean not null default false,
  undone_at   timestamptz
);
create index if not exists island_rounds_season_idx on public.island_rounds (season, id desc);

alter table public.island_meta enable row level security;
alter table public.island_rounds enable row level security;
revoke all on public.island_meta, public.island_rounds from anon, authenticated;
grant select, insert, update, delete on public.island_meta, public.island_rounds to service_role;

-- RUN A ROUND: draw names in random order until p_remaining are left.
create or replace function public.island_run(p_remaining int, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_existing island_rounds%rowtype;
  v_pool uuid[];
  v_order uuid[];
  v_n int;
  v_round int;
  v_id bigint;
begin
  -- One round at a time.
  select season into v_season from island_meta where id = 1 for update;

  select * into v_existing from island_rounds where request_id = p_request_id;
  if found then
    return jsonb_build_object('round_id', v_existing.id, 'round', v_existing.round,
      'picked', to_jsonb(v_existing.picked), 'remaining', to_jsonb(v_existing.remaining), 'replayed', true);
  end if;

  -- Everyone active who hasn't been left over in an earlier round this game.
  select array_agg(p.id) into v_pool
  from players p
  where p.active
    and not exists (select 1 from island_rounds r
                    where r.season = v_season and not r.undone and p.id = any(r.remaining));
  v_n := coalesce(array_length(v_pool, 1), 0);
  if p_remaining < 1 or p_remaining >= v_n then raise exception 'INVALID_REMAINING'; end if;

  -- Fair shuffle using the same crypto-strength source as lootboxes.
  select array_agg(x order by secure_random()) into v_order from unnest(v_pool) x;

  select count(*) + 1 into v_round from island_rounds where season = v_season and not undone;
  insert into island_rounds (request_id, season, round, picked, remaining)
  values (p_request_id, v_season, v_round, v_order[1 : v_n - p_remaining], v_order[v_n - p_remaining + 1 : v_n])
  returning id into v_id;

  insert into admin_actions (action_type, player_id, metadata)
  values ('island_round', null, jsonb_build_object('season', v_season, 'round', v_round, 'remaining', p_remaining, 'pool', v_n));

  return jsonb_build_object('round_id', v_id, 'round', v_round,
    'picked', to_jsonb(v_order[1 : v_n - p_remaining]), 'remaining', to_jsonb(v_order[v_n - p_remaining + 1 : v_n]), 'replayed', false);
end $$;

-- UNDO the latest round of this game: its left-over players are back on the island.
create or replace function public.island_undo()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_r island_rounds%rowtype;
begin
  select season into v_season from island_meta where id = 1 for update;
  select * into v_r from island_rounds where season = v_season and not undone order by id desc limit 1;
  if not found then raise exception 'NOTHING_TO_UNDO'; end if;
  update island_rounds set undone = true, undone_at = clock_timestamp() where id = v_r.id;
  insert into admin_actions (action_type, player_id, metadata)
  values ('island_undo', null, jsonb_build_object('season', v_season, 'round', v_r.round));
  return jsonb_build_object('round', v_r.round);
end $$;

-- START OVER: a new game with everyone back. Old games stay in history.
create or replace function public.island_reset()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_season int;
begin
  update island_meta set season = season + 1 where id = 1 returning season into v_season;
  insert into admin_actions (action_type, player_id, metadata)
  values ('island_reset', null, jsonb_build_object('season', v_season));
  return v_season;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
