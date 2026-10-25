-- Lootbox Mania: security and performance hardening.
-- Run once, after 0001. Safe to run again.
--
-- Model: the public (anon) key is readable by anyone, so it may only read the
-- columns public pages show. Every write goes through server code that checks
-- the admin session and then uses the service role.

-- ============================================================
-- 1. Least-privilege table access
-- Supabase grants anon/authenticated full table privileges by default and
-- relies on RLS alone. Revoke everything, then grant only the columns the
-- public pages read. Writes stay impossible even if a policy is added by mistake.
-- ============================================================
revoke all on public.players, public.lootbox_items, public.player_lootbox_items,
              public.lootbox_rolls, public.admin_actions
  from anon, authenticated;

-- active/undone are granted only because the row policies below read them.
-- Every visible row is active and not undone, so they reveal nothing.
grant select (id, slug, discord_username, discord_display_name, discord_avatar_url,
              lootbox_status, escaped_via, active)
  on public.players to anon, authenticated;

grant select (id, name, rarity, base_probability, required, sort_order, icon_path, active)
  on public.lootbox_items to anon, authenticated;

grant select (player_id, item_id, times_rolled, collected, excluded_by_roberts_rule, first_rolled_at)
  on public.player_lootbox_items to anon, authenticated;

-- Not granted: request_id (idempotency key) and state_before (undo snapshot).
grant select (id, player_id, item_id, rarity, rolled_at, claim_window, times_rolled_after,
              was_new_item, triggered_roberts_rule, triggered_completion, triggered_reset, undone)
  on public.lootbox_rolls to anon, authenticated;

-- admin_actions: no public access at all.

-- ============================================================
-- 2. Row-level policies: hide deactivated players and undone rolls
-- ============================================================
drop policy if exists "public read players"      on public.players;
drop policy if exists "public read items"        on public.lootbox_items;
drop policy if exists "public read player items" on public.player_lootbox_items;
drop policy if exists "public read rolls"        on public.lootbox_rolls;
drop policy if exists "public reads active players"         on public.players;
drop policy if exists "public reads items"                  on public.lootbox_items;
drop policy if exists "public reads active players' items"  on public.player_lootbox_items;
drop policy if exists "public reads live rolls"             on public.lootbox_rolls;

create policy "public reads active players" on public.players
  for select to anon, authenticated
  using (active);

create policy "public reads items" on public.lootbox_items
  for select to anon, authenticated
  using (true);

create policy "public reads active players' items" on public.player_lootbox_items
  for select to anon, authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.active));

create policy "public reads live rolls" on public.lootbox_rolls
  for select to anon, authenticated
  using (not undone and exists (select 1 from public.players p where p.id = player_id and p.active));

-- ============================================================
-- 3. Index for "boxes used this window" across all players (home/players pages)
-- ============================================================
create index if not exists lootbox_rolls_claim_window_idx
  on public.lootbox_rolls (claim_window) where not undone;

-- ============================================================
-- 4. Roll result includes what the Discord message needs,
-- so the server makes no extra queries after a roll.
-- ============================================================
create or replace function public.roll_result(p_roll_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'roll_id',                r.id,
    'player_id',              r.player_id,
    'player_slug',            p.slug,
    'discord_user_id',        p.discord_user_id,
    'item_id',                r.item_id,
    'item_name',              i.name,
    'item_odds',              i.base_probability,
    'icon_path',              i.icon_path,
    'rarity',                 r.rarity,
    'times_rolled',           r.times_rolled_after,
    'was_new_item',           r.was_new_item,
    'triggered_roberts_rule', r.triggered_roberts_rule,
    'triggered_completion',   r.triggered_completion,
    'triggered_reset',        r.triggered_reset,
    'status',                 p.lootbox_status,
    'checklist_collected', (
      select count(*) from player_lootbox_items x join lootbox_items xi on xi.id = x.item_id
      where x.player_id = r.player_id and xi.required and x.collected)
  )
  from lootbox_rolls r
  join lootbox_items i on i.id = r.item_id
  join players p on p.id = r.player_id
  where r.id = p_roll_id;
$$;

-- ============================================================
-- 5. Functions: only the service role may call them.
-- Also stop Supabase from auto-granting future functions to the public roles.
-- ============================================================
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
