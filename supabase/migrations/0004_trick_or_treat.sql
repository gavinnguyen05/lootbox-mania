-- Lootbox Mania: trick-or-treating. Run once, after 0001-0003. Safe to run again.
--
-- Escaped players can trick-or-treat at a neighbor's house: 2 treats per
-- claim window (same resets as lootboxes). Each neighbor has their own odds
-- and lines. Candy totals feed the Discord candy leaderboard.
-- Ties: whoever reached the amount first ranks higher (candy_reached_at).
-- Everything here is admin-only: the public key can't read or change it.

-- ============================================================
-- Tables
-- ============================================================
alter table public.players add column if not exists candy int not null default 0 check (candy >= 0);
alter table public.players add column if not exists candy_reached_at timestamptz not null default clock_timestamp();

create table if not exists public.neighbors (
  id          text primary key,              -- e.g. 'giovanni'
  name        text not null,
  flag        text not null default '',      -- shown in admin, e.g. 🇮🇹
  emoji_code  text not null,                 -- Discord emoji, e.g. <:giovanni:123>
  sort_order  int not null default 0,
  active      boolean not null default true
);

-- {neighbor} becomes the neighbor's emoji, {candies} becomes one candy emoji per candy.
create table if not exists public.neighbor_outcomes (
  id          bigint generated always as identity primary key,
  neighbor_id text not null references public.neighbors(id) on delete cascade,
  weight      numeric not null check (weight > 0),
  candy       int not null check (candy >= 0),
  message     text not null,
  sort_order  int not null default 0
);

create table if not exists public.treats (
  id             bigint generated always as identity primary key,
  request_id     uuid not null unique,         -- idempotency key from the admin UI
  player_id      uuid not null references public.players(id) on delete cascade,
  neighbor_id    text not null references public.neighbors(id),
  outcome_id     bigint not null references public.neighbor_outcomes(id),
  candy          int not null,
  claim_window   text not null,
  created_at     timestamptz not null default clock_timestamp(),
  candy_before   int not null,                 -- for undo/reroll
  reached_before timestamptz not null,
  undone         boolean not null default false,
  undone_at      timestamptz
);
create index if not exists treats_player_idx on public.treats (player_id, id desc);
create index if not exists treats_window_idx on public.treats (claim_window) where not undone;

alter table public.neighbors enable row level security;
alter table public.neighbor_outcomes enable row level security;
alter table public.treats enable row level security;
revoke all on public.neighbors, public.neighbor_outcomes, public.treats from anon, authenticated;
-- The server (service role) reads these for the admin page. Supabase usually
-- grants this by default; it's explicit here so it never depends on that.
grant select, insert, update, delete on public.neighbors, public.neighbor_outcomes, public.treats to service_role;

-- ============================================================
-- Giovanni (45 / 30 / 15 / 8 / 2)
-- ============================================================
insert into public.neighbors (id, name, flag, emoji_code, sort_order)
values ('giovanni', 'Giovanni', '🇮🇹', '<:giovanni:1557823584141844511>', 10)
on conflict (id) do nothing;

insert into public.neighbor_outcomes (neighbor_id, weight, candy, message, sort_order)
select 'giovanni', o.weight, o.candy, o.message, o.sort_order
from (values
  (45, 4,  '{neighbor} Mamma mia! Take **4 Candy**! {candies} (45% chance)', 1),
  (30, 6,  '{neighbor} Bellissimo! You get **6 Candy**! {candies} (30% chance)', 2),
  (15, 9,  '{neighbor} Ottimo! **9 Candy** for you! {candies} (15% chance)', 3),
  (8,  15, '{neighbor} Mamma mia, che fortuna! Take **15 Candy**! {candies} (8% chance)', 4),
  (2,  30, '{neighbor} MADONNA MIA! JACKPOT! **30 CANDY**! {candies} (2% chance)', 5)
) as o(weight, candy, message, sort_order)
where not exists (select 1 from public.neighbor_outcomes where neighbor_id = 'giovanni');

-- ============================================================
-- Starting totals from the current Discord leaderboard.
-- Only applied before the first treat, so re-running this file never
-- overwrites real progress. Earlier list position = reached first.
-- ============================================================
update public.players p
set candy = v.candy,
    candy_reached_at = timestamptz '2026-10-01 00:00:00+00' + (v.pos * interval '1 second')
from (values
  ('215641220347723776', 152, 1),  ('498896414903107587', 149, 2),
  ('444357562335232011', 133, 3),  ('390270004538507264', 117, 4),
  ('305180173429374997', 98, 5),   ('387404435212730368', 95, 6),
  ('341337530550976512', 96, 7),   ('364618988182962176', 94, 8),
  ('507781107148914703', 90, 9),   ('326056395030003713', 79, 10),
  ('252181714900746240', 66, 11),  ('297402266174881803', 52, 12),
  ('316026985778249730', 35, 13),  ('419365417367109642', 27, 14),
  ('435223685633146880', 7, 15),   ('412313600149946379', 6, 16)
) as v(discord_user_id, candy, pos)
where p.discord_user_id = v.discord_user_id
  and not exists (select 1 from public.treats);

-- ============================================================
-- Functions
-- ============================================================

-- What the admin sees after a treat.
create or replace function public.treat_result(p_treat_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'treat_id',     t.id,
    'player_id',    t.player_id,
    'neighbor_id',  n.id,
    'neighbor',     n.name,
    'flag',         n.flag,
    'emoji_code',   n.emoji_code,
    'candy',        t.candy,
    'message',      o.message,
    'total',        p.candy,
    'treats_left',  greatest(0, 2 - (
      select count(*) from treats w
      where w.player_id = t.player_id and w.claim_window = current_claim_window(now()) and not w.undone))
  )
  from treats t
  join neighbors n on n.id = t.neighbor_id
  join neighbor_outcomes o on o.id = t.outcome_id
  join players p on p.id = t.player_id
  where t.id = p_treat_id;
$$;

-- Roll one treat. The caller has already locked the player row and checked limits.
create or replace function public.roll_treat(p_player_id uuid, p_neighbor_id text, p_request_id uuid, p_window text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player players%rowtype;
  v_total  numeric;
  v_pick   numeric;
  v_acc    numeric := 0;
  v_out    neighbor_outcomes%rowtype;
  v_hit    neighbor_outcomes%rowtype;
  v_id     bigint;
begin
  select * into v_player from players where id = p_player_id;
  select sum(weight) into v_total from neighbor_outcomes where neighbor_id = p_neighbor_id;
  if v_total is null then raise exception 'NEIGHBOR_NOT_FOUND'; end if;

  -- Weighted pick with the same crypto-strength random source as lootboxes.
  v_pick := secure_random() * v_total;
  for v_out in select * from neighbor_outcomes where neighbor_id = p_neighbor_id order by sort_order, id loop
    v_acc := v_acc + v_out.weight;
    v_hit := v_out;                 -- falls through to the last outcome on rounding
    exit when v_pick < v_acc;
  end loop;

  insert into treats (request_id, player_id, neighbor_id, outcome_id, candy, claim_window, candy_before, reached_before)
  values (p_request_id, p_player_id, p_neighbor_id, v_hit.id, v_hit.candy, p_window, v_player.candy, v_player.candy_reached_at)
  returning id into v_id;

  update players set
    candy = candy + v_hit.candy,
    candy_reached_at = case when v_hit.candy > 0 then clock_timestamp() else candy_reached_at end
  where id = p_player_id;

  return treat_result(v_id) || jsonb_build_object('replayed', false);
end $$;

-- TRICK OR TREAT: escaped players only, 2 per claim window.
create or replace function public.trick_or_treat(p_player_id uuid, p_neighbor_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player players%rowtype;
  v_existing bigint;
  v_window text := current_claim_window(now());
  v_used int;
begin
  select * into v_player from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  select id into v_existing from treats where request_id = p_request_id;
  if v_existing is not null then return treat_result(v_existing) || jsonb_build_object('replayed', true); end if;

  if not v_player.active then raise exception 'PLAYER_INACTIVE'; end if;
  if v_player.lootbox_status <> 'escaped' then raise exception 'PLAYER_NOT_ESCAPED'; end if;
  if not exists (select 1 from neighbors where id = p_neighbor_id and active) then raise exception 'NEIGHBOR_NOT_FOUND'; end if;

  select count(*) into v_used from treats where player_id = p_player_id and claim_window = v_window and not undone;
  if v_used >= 2 then raise exception 'NO_TREATS_LEFT'; end if;

  return roll_treat(p_player_id, p_neighbor_id, p_request_id, v_window);
end $$;

-- Undo the player's latest treat. Refuses if their candy was set by hand since.
create or replace function public.undo_last_treat(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t treats%rowtype;
begin
  perform 1 from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  select * into v_t from treats where player_id = p_player_id and not undone order by id desc limit 1;
  if not found then raise exception 'NOTHING_TO_UNDO'; end if;
  if exists (select 1 from admin_actions where player_id = p_player_id and action_type = 'set_candy' and created_at > v_t.created_at) then
    raise exception 'MANUAL_EDIT_AFTER_TREAT';
  end if;

  update players set candy = v_t.candy_before, candy_reached_at = v_t.reached_before where id = p_player_id;
  update treats set undone = true, undone_at = clock_timestamp() where id = v_t.id;
  insert into admin_actions (action_type, player_id, metadata)
  values ('undo_treat', p_player_id, jsonb_build_object('treat_id', v_t.id, 'candy', v_t.candy));
  return jsonb_build_object('treat_id', v_t.id, 'neighbor_id', v_t.neighbor_id, 'claim_window', v_t.claim_window);
end $$;

-- REROLL: undo the latest treat and roll again in the same slot, same neighbor.
create or replace function public.reroll_treat(p_player_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing bigint;
  v_undone jsonb;
begin
  perform 1 from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  select id into v_existing from treats where request_id = p_request_id;
  if v_existing is not null then return treat_result(v_existing) || jsonb_build_object('replayed', true); end if;

  v_undone := undo_last_treat(p_player_id);
  insert into admin_actions (action_type, player_id, metadata)
  values ('reroll_treat', p_player_id, jsonb_build_object('replaced_treat_id', v_undone->>'treat_id'));
  return roll_treat(p_player_id, v_undone->>'neighbor_id', p_request_id, v_undone->>'claim_window');
end $$;

-- Manual correction of a player's candy total. Logged.
create or replace function public.admin_set_candy(p_player_id uuid, p_amount int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old int;
begin
  if p_amount < 0 or p_amount > 100000 then raise exception 'INVALID_COUNT'; end if;
  select candy into v_old from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_old = p_amount then return; end if;
  update players set candy = p_amount, candy_reached_at = clock_timestamp() where id = p_player_id;
  insert into admin_actions (action_type, player_id, metadata)
  values ('set_candy', p_player_id, jsonb_build_object('old', v_old, 'new', p_amount));
end $$;

-- Only the server (service role) may call these.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
