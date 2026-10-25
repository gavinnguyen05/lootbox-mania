-- Lootbox Mania: schema, seed data, and all game logic.
-- Every state change happens inside a Postgres function, so each roll,
-- undo, and manual edit is a single atomic transaction.

-- ============================================================
-- Types
-- ============================================================
create type public.rarity as enum ('common', 'uncommon', 'rare', 'legendary', 'cursed');
create type public.lootbox_status as enum ('trapped', 'escaped');

-- ============================================================
-- Tables
-- ============================================================
create table public.players (
  id                    uuid primary key default gen_random_uuid(),
  discord_user_id       text not null unique check (discord_user_id ~ '^[0-9]{15,21}$'),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]+$'),
  discord_username      text,
  discord_display_name  text,
  discord_avatar_url    text,
  lootbox_status        public.lootbox_status not null default 'trapped',
  escaped_via           text check (escaped_via in ('checklist', 'golden_kitkat', 'manual')),
  escaped_at            timestamptz,
  active                boolean not null default true,
  profile_synced_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- base_probability is the odds (in percent) of the item's rarity tier.
-- All items in a tier share the same value. The RNG picks a tier by these
-- odds, then picks uniformly among that player's eligible items in the tier.
create table public.lootbox_items (
  id                text primary key,             -- stable slug, e.g. 'fun-dip'
  name              text not null,
  rarity            public.rarity not null,
  base_probability  numeric(6,3) not null check (base_probability > 0),
  required          boolean not null,             -- counts toward the 10/10 checklist
  sort_order        int not null,
  icon_path         text not null,
  active            boolean not null default true
);

create table public.player_lootbox_items (
  player_id                 uuid not null references public.players(id) on delete cascade,
  item_id                   text not null references public.lootbox_items(id),
  times_rolled              int not null default 0 check (times_rolled >= 0),
  collected                 boolean not null default false,
  excluded_by_roberts_rule  boolean not null default false,
  first_rolled_at           timestamptz,
  updated_at                timestamptz not null default now(),
  primary key (player_id, item_id)
);

create table public.lootbox_rolls (
  id                      bigint generated always as identity primary key,
  request_id              uuid not null unique,     -- idempotency key from the admin UI
  player_id               uuid not null references public.players(id) on delete cascade,
  item_id                 text not null references public.lootbox_items(id),
  rarity                  public.rarity not null,
  rolled_at               timestamptz not null default clock_timestamp(),
  claim_window            text not null,            -- e.g. '2026-10-25:W2'
  times_rolled_after      int not null,
  was_new_item            boolean not null,
  triggered_roberts_rule  boolean not null default false,
  triggered_completion    boolean not null default false,
  triggered_reset         boolean not null default false,
  undone                  boolean not null default false,
  undone_at               timestamptz,
  state_before            jsonb not null            -- full player state before this roll, used by undo
);
create index lootbox_rolls_player_idx on public.lootbox_rolls (player_id, id desc);
create index lootbox_rolls_recent_idx on public.lootbox_rolls (rolled_at desc);
create index lootbox_rolls_window_idx on public.lootbox_rolls (player_id, claim_window) where not undone;

create table public.admin_actions (
  id          bigint generated always as identity primary key,
  action_type text not null,
  player_id   uuid references public.players(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default clock_timestamp()
);
create index admin_actions_player_idx on public.admin_actions (player_id, created_at desc);

-- ============================================================
-- Seed items
-- ============================================================
insert into public.lootbox_items (id, name, rarity, base_probability, required, sort_order, icon_path) values
  ('starburst',          'Starburst',           'common',    49.0, true,  10, '/assets/candy/starburst.png'),
  ('dum-dum',            'Dum Dum',             'common',    49.0, true,  20, '/assets/candy/dum-dum.png'),
  ('dots',               'Dots',                'common',    49.0, true,  30, '/assets/candy/dots.png'),
  ('tootsie-roll',       'Tootsie Roll',        'common',    49.0, true,  40, '/assets/candy/tootsie-roll.png'),
  ('fun-dip',            'Fun Dip',             'common',    49.0, true,  50, '/assets/candy/fun-dip.png'),
  ('butterfinger',       'Butterfinger',        'uncommon',  31.0, true,  60, '/assets/candy/butterfinger.png'),
  ('100-grand',          '100 Grand',           'uncommon',  31.0, true,  70, '/assets/candy/100-grand.png'),
  ('sour-patch-kids',    'Sour Patch Kids',     'uncommon',  31.0, true,  80, '/assets/candy/sour-patch-kids.png'),
  ('krabby-patty',       'Krabby Patty',        'rare',      18.0, true,  90, '/assets/candy/krabby-patty.png'),
  ('nerds-rope',         'Nerds Rope',          'rare',      18.0, true, 100, '/assets/candy/nerds-rope.png'),
  ('golden-kitkat',      'Golden KitKat',       'legendary',  1.5, false, 110, '/assets/candy/golden-kitkat.png'),
  ('fent-laced-ring-pop','Fent-Laced Ring Pop', 'cursed',     0.5, false, 120, '/assets/candy/fent-laced-ring-pop.png');

-- ============================================================
-- Helpers
-- ============================================================

-- Every player gets one row per item the moment they are added.
create or replace function public.ensure_player_items(p_player_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into player_lootbox_items (player_id, item_id)
  select p_player_id, id from lootbox_items
  on conflict do nothing;
$$;

create or replace function public.players_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform ensure_player_items(new.id);
  return new;
end $$;

create trigger players_after_insert
after insert on public.players
for each row execute function public.players_after_insert();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger players_touch before update on public.players
for each row execute function public.touch_updated_at();
create trigger player_items_touch before update on public.player_lootbox_items
for each row execute function public.touch_updated_at();

-- Claim windows, in America/Los_Angeles:
--   W1 = 12:00 AM to 7:59 PM, W2 = 8:00 PM to 11:59 PM. Two boxes each.
-- Unused boxes never carry over because each window has its own key.
create or replace function public.current_claim_window(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char(p_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD')
      || case when extract(hour from p_at at time zone 'America/Los_Angeles') >= 20
              then ':W2' else ':W1' end;
$$;

-- Uniform [0, 1) from 48 bits of gen_random_uuid(), which Postgres fills
-- from its cryptographically strong random source.
create or replace function public.secure_random()
returns double precision language sql volatile as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint)::double precision
         / 281474976710656.0;
$$;

-- Snapshot of everything a roll can change. Undo restores exactly this.
create or replace function public.player_state_snapshot(p_player_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status',      p.lootbox_status,
    'escaped_via', p.escaped_via,
    'escaped_at',  p.escaped_at,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_id',         i.item_id,
        'times_rolled',    i.times_rolled,
        'collected',       i.collected,
        'excluded',        i.excluded_by_roberts_rule,
        'first_rolled_at', i.first_rolled_at
      )), '[]'::jsonb)
      from player_lootbox_items i where i.player_id = p.id
    )
  )
  from players p where p.id = p_player_id;
$$;

create or replace function public.restore_player_state(p_player_id uuid, p_state jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update players set
    lootbox_status = (p_state->>'status')::lootbox_status,
    escaped_via    = p_state->>'escaped_via',
    escaped_at     = (p_state->>'escaped_at')::timestamptz
  where id = p_player_id;

  update player_lootbox_items pli set
    times_rolled             = s.times_rolled,
    collected                = s.collected,
    excluded_by_roberts_rule = s.excluded,
    first_rolled_at          = s.first_rolled_at
  from jsonb_to_recordset(p_state->'items')
       as s(item_id text, times_rolled int, collected boolean, excluded boolean, first_rolled_at timestamptz)
  where pli.player_id = p_player_id and pli.item_id = s.item_id;
end $$;

-- Escape a trapped player whose 10 required candies are all collected.
create or replace function public.check_checklist_completion(p_player_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_missing int;
begin
  select count(*) into v_missing
  from player_lootbox_items pli
  join lootbox_items i on i.id = pli.item_id
  where pli.player_id = p_player_id and i.required and i.active and not pli.collected;

  if v_missing = 0 then
    update players set lootbox_status = 'escaped', escaped_via = 'checklist', escaped_at = now()
    where id = p_player_id and lootbox_status = 'trapped';
    return found;
  end if;
  return false;
end $$;

-- Result payload for a stored roll (also used to answer a repeated request_id).
create or replace function public.roll_result(p_roll_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'roll_id',                r.id,
    'player_id',              r.player_id,
    'item_id',                r.item_id,
    'item_name',              i.name,
    'icon_path',              i.icon_path,
    'rarity',                 r.rarity,
    'rolled_at',              r.rolled_at,
    'claim_window',           r.claim_window,
    'times_rolled',           r.times_rolled_after,
    'was_new_item',           r.was_new_item,
    'triggered_roberts_rule', r.triggered_roberts_rule,
    'triggered_completion',   r.triggered_completion,
    'triggered_reset',        r.triggered_reset,
    'status',                 p.lootbox_status,
    'escaped_via',            p.escaped_via,
    'rarity_collected', (
      select count(*) from player_lootbox_items x join lootbox_items xi on xi.id = x.item_id
      where x.player_id = r.player_id and xi.rarity = r.rarity and xi.required and x.collected),
    'rarity_total', (
      select count(*) from lootbox_items xi where xi.rarity = r.rarity and xi.required and xi.active),
    'checklist_collected', (
      select count(*) from player_lootbox_items x join lootbox_items xi on xi.id = x.item_id
      where x.player_id = r.player_id and xi.required and x.collected),
    'boxes_left', greatest(0, 2 - (
      select count(*) from lootbox_rolls w
      where w.player_id = r.player_id and w.claim_window = current_claim_window(now()) and not w.undone))
  )
  from lootbox_rolls r
  join lootbox_items i on i.id = r.item_id
  join players p on p.id = r.player_id
  where r.id = p_roll_id;
$$;

-- ============================================================
-- OPEN ONE LOOTBOX
-- ============================================================
create or replace function public.open_lootbox(p_player_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player    players%rowtype;
  v_existing  bigint;
  v_window    text := current_claim_window(now());
  v_used      int;
  v_snapshot  jsonb;
  v_total     numeric;
  v_pick      numeric;
  v_acc       numeric := 0;
  v_rarity    rarity;
  v_count     int;
  v_item      lootbox_items%rowtype;
  v_before    int;
  v_after     int;
  v_roberts   boolean := false;
  v_complete  boolean := false;
  v_reset     boolean := false;
  v_roll_id   bigint;
  r           record;
begin
  -- Lock the player row. All rolls for one player run one at a time.
  select * into v_player from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  -- Idempotency: a repeated request returns the original result, no new roll.
  select id into v_existing from lootbox_rolls where request_id = p_request_id;
  if v_existing is not null then
    return roll_result(v_existing) || jsonb_build_object('replayed', true);
  end if;

  if not v_player.active then raise exception 'PLAYER_INACTIVE'; end if;
  if v_player.lootbox_status = 'escaped' then raise exception 'PLAYER_ESCAPED'; end if;

  select count(*) into v_used from lootbox_rolls
  where player_id = p_player_id and claim_window = v_window and not undone;
  if v_used >= 2 then raise exception 'NO_BOXES_LEFT'; end if;

  perform ensure_player_items(p_player_id);
  v_snapshot := player_state_snapshot(p_player_id);

  -- 1. Pick a rarity. Tiers where every item is excluded by Robert's Rule IV
  --    drop out and the remaining odds are renormalized. This is the same as
  --    rerolling the rarity, with no loop.
  select sum(t.w) into v_total from (
    select max(i.base_probability) as w
    from lootbox_items i
    join player_lootbox_items p on p.item_id = i.id and p.player_id = p_player_id
    where i.active and not p.excluded_by_roberts_rule
    group by i.rarity
  ) t;
  if v_total is null or v_total <= 0 then raise exception 'NO_ELIGIBLE_ITEMS'; end if;

  v_pick := secure_random() * v_total;
  for r in
    select i.rarity, max(i.base_probability) as w
    from lootbox_items i
    join player_lootbox_items p on p.item_id = i.id and p.player_id = p_player_id
    where i.active and not p.excluded_by_roberts_rule
    group by i.rarity
    order by i.rarity
  loop
    v_acc := v_acc + r.w;
    v_rarity := r.rarity;            -- falls through to the last tier on rounding
    exit when v_pick < v_acc;
  end loop;

  -- 2. Pick an item uniformly from this player's eligible pool in that tier.
  select count(*) into v_count
  from lootbox_items i
  join player_lootbox_items p on p.item_id = i.id and p.player_id = p_player_id
  where i.active and i.rarity = v_rarity and not p.excluded_by_roberts_rule;

  select i.* into v_item
  from lootbox_items i
  join player_lootbox_items p on p.item_id = i.id and p.player_id = p_player_id
  where i.active and i.rarity = v_rarity and not p.excluded_by_roberts_rule
  order by i.sort_order
  offset floor(secure_random() * v_count)::int
  limit 1;

  -- 3. Record the drop on the player's item row.
  select times_rolled into v_before from player_lootbox_items
  where player_id = p_player_id and item_id = v_item.id;
  v_after := v_before + 1;

  update player_lootbox_items set
    times_rolled    = v_after,
    collected       = true,
    first_rolled_at = coalesce(first_rolled_at, now())
  where player_id = p_player_id and item_id = v_item.id;

  -- 4. Apply rules.
  if v_item.rarity = 'cursed' then
    -- Wipe all normal checklist progress, including Robert's Rule exclusions.
    update player_lootbox_items pli set
      times_rolled = 0, collected = false, excluded_by_roberts_rule = false, first_rolled_at = null
    from lootbox_items i
    where pli.item_id = i.id and pli.player_id = p_player_id and i.required;
    update players set lootbox_status = 'trapped', escaped_via = null, escaped_at = null
    where id = p_player_id;
    v_reset := true;

  elsif v_item.rarity = 'legendary' then
    -- Escape immediately. The checklist keeps only what was really collected.
    update players set lootbox_status = 'escaped', escaped_via = 'golden_kitkat', escaped_at = now()
    where id = p_player_id;
    v_complete := true;

  else
    -- Robert's Rule IV: third copy of the same candy removes it from this player's pool.
    if v_item.required and v_after >= 3 then
      update player_lootbox_items set excluded_by_roberts_rule = true
      where player_id = p_player_id and item_id = v_item.id and not excluded_by_roberts_rule;
      v_roberts := found;
    end if;
    v_complete := check_checklist_completion(p_player_id);
  end if;

  -- 5. Permanent history.
  insert into lootbox_rolls (
    request_id, player_id, item_id, rarity, claim_window, times_rolled_after,
    was_new_item, triggered_roberts_rule, triggered_completion, triggered_reset, state_before
  ) values (
    p_request_id, p_player_id, v_item.id, v_item.rarity, v_window, v_after,
    v_before = 0, v_roberts, v_complete, v_reset, v_snapshot
  ) returning id into v_roll_id;

  return roll_result(v_roll_id) || jsonb_build_object('replayed', false);
end $$;

-- ============================================================
-- UNDO LAST ROLL
-- Restores the exact state saved before the roll, including anything a
-- curse wiped, and frees the box (box usage only counts rolls not undone).
-- Refuses if an admin edited this player by hand after the roll, because
-- restoring the snapshot would silently discard that edit.
-- ============================================================
create or replace function public.undo_last_roll(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_roll lootbox_rolls%rowtype;
begin
  perform 1 from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  select * into v_roll from lootbox_rolls
  where player_id = p_player_id and not undone
  order by id desc limit 1;
  if not found then raise exception 'NOTHING_TO_UNDO'; end if;

  if exists (
    select 1 from admin_actions
    where player_id = p_player_id
      and created_at > v_roll.rolled_at
      and action_type in ('set_item', 'reset_progress', 'set_status')
  ) then
    raise exception 'MANUAL_EDIT_AFTER_ROLL';
  end if;

  perform restore_player_state(p_player_id, v_roll.state_before);
  update lootbox_rolls set undone = true, undone_at = now() where id = v_roll.id;

  insert into admin_actions (action_type, player_id, metadata)
  values ('undo_roll', p_player_id, jsonb_build_object('roll_id', v_roll.id, 'item_id', v_roll.item_id));

  return jsonb_build_object('roll_id', v_roll.id, 'item_id', v_roll.item_id);
end $$;

-- ============================================================
-- MANUAL ADMIN EDITS (each one logged)
-- ============================================================
create or replace function public.admin_set_item(
  p_player_id uuid, p_item_id text, p_times_rolled int, p_collected boolean, p_excluded boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
begin
  perform 1 from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if p_times_rolled < 0 then raise exception 'INVALID_COUNT'; end if;

  select jsonb_build_object('times_rolled', times_rolled, 'collected', collected, 'excluded', excluded_by_roberts_rule)
  into v_old from player_lootbox_items where player_id = p_player_id and item_id = p_item_id;
  if v_old is null then raise exception 'ITEM_NOT_FOUND'; end if;

  update player_lootbox_items set
    times_rolled             = p_times_rolled,
    collected                = p_collected,
    excluded_by_roberts_rule = p_excluded,
    first_rolled_at          = case when p_collected then coalesce(first_rolled_at, now()) else null end
  where player_id = p_player_id and item_id = p_item_id;

  perform check_checklist_completion(p_player_id);

  insert into admin_actions (action_type, player_id, metadata)
  values ('set_item', p_player_id, jsonb_build_object(
    'item_id', p_item_id, 'old', v_old,
    'new', jsonb_build_object('times_rolled', p_times_rolled, 'collected', p_collected, 'excluded', p_excluded)));
end $$;

create or replace function public.admin_reset_progress(p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into admin_actions (action_type, player_id, metadata)
  values ('reset_progress', p_player_id, jsonb_build_object('before', player_state_snapshot(p_player_id)));

  update player_lootbox_items set
    times_rolled = 0, collected = false, excluded_by_roberts_rule = false, first_rolled_at = null
  where player_id = p_player_id;
  update players set lootbox_status = 'trapped', escaped_via = null, escaped_at = null
  where id = p_player_id;
end $$;

create or replace function public.admin_set_status(p_player_id uuid, p_status lootbox_status)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old lootbox_status;
begin
  select lootbox_status into v_old from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  update players set
    lootbox_status = p_status,
    escaped_via    = case when p_status = 'escaped' then 'manual' else null end,
    escaped_at     = case when p_status = 'escaped' then now() else null end
  where id = p_player_id;

  insert into admin_actions (action_type, player_id, metadata)
  values ('set_status', p_player_id, jsonb_build_object('old', v_old, 'new', p_status));
end $$;

-- ============================================================
-- Security
-- Public pages read with the anon key. All writes go through the
-- functions above, called only by the server with the service role.
-- ============================================================
alter table public.players              enable row level security;
alter table public.lootbox_items        enable row level security;
alter table public.player_lootbox_items enable row level security;
alter table public.lootbox_rolls        enable row level security;
alter table public.admin_actions        enable row level security;

create policy "public read players"       on public.players              for select using (true);
create policy "public read items"         on public.lootbox_items        for select using (true);
create policy "public read player items"  on public.player_lootbox_items for select using (true);
create policy "public read rolls"         on public.lootbox_rolls        for select using (true);
-- admin_actions: no public policy, service role only.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
