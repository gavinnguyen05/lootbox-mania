-- Lootbox Mania: trick-or-treat-only players. Run after 0001-0017. Safe to run again.
--
-- A treat-only player can trick-or-treat, shows on the candy leaderboard, and
-- can get event candy. They never show on the public site (lootbox pages,
-- checklists, drops) and never sit on Candy Island.
-- Added from the admin Trick-or-Treat tab. Treat-only players count as escaped,
-- so trick-or-treat works for them and lootboxes can never be opened for them.

alter table public.players add column if not exists treat_only boolean not null default false;

-- The public policies read it, so the public role needs it. Every row they can
-- see has it false, so it reveals nothing.
grant select (treat_only) on public.players to anon, authenticated;

drop policy if exists "public reads active players" on public.players;
create policy "public reads active players" on public.players
  for select to anon, authenticated
  using (active and not treat_only);

drop policy if exists "public reads active players' items" on public.player_lootbox_items;
create policy "public reads active players' items" on public.player_lootbox_items
  for select to anon, authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.active and not p.treat_only));

drop policy if exists "public reads live rolls" on public.lootbox_rolls;
create policy "public reads live rolls" on public.lootbox_rolls
  for select to anon, authenticated
  using (not undone and exists (select 1 from public.players p where p.id = player_id and p.active and not p.treat_only));

-- Candy Island: treat-only players are never on it (replaces 0014's two functions).
create or replace function public.island_set_immunity(p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_season int;
begin
  select season into v_season from island_meta where id = 1 for update;
  if p_player_id is not null then
    if not exists (select 1 from players where id = p_player_id and active and not treat_only) then raise exception 'PLAYER_NOT_FOUND'; end if;
    if exists (select 1 from island_rounds r where r.season = v_season and not r.undone and p_player_id = any(r.remaining)) then
      raise exception 'PLAYER_ALREADY_OUT';
    end if;
  end if;
  update island_meta set immune_id = p_player_id where id = 1;
  insert into admin_actions (action_type, player_id, metadata)
  values ('island_immunity', p_player_id, jsonb_build_object('season', v_season));
end $$;

-- RUN A ROUND (replaces 0010's): the immune player is drawn first and can't be left over.
create or replace function public.island_run(p_remaining int, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_immune uuid;
  v_existing island_rounds%rowtype;
  v_pool uuid[];
  v_order uuid[];
  v_n int;
  v_round int;
  v_id bigint;
begin
  select season, immune_id into v_season, v_immune from island_meta where id = 1 for update;

  select * into v_existing from island_rounds where request_id = p_request_id;
  if found then
    return jsonb_build_object('round_id', v_existing.id, 'round', v_existing.round, 'immune_id', v_existing.immune_id,
      'picked', to_jsonb(v_existing.picked), 'remaining', to_jsonb(v_existing.remaining), 'replayed', true);
  end if;

  -- Everyone active who hasn't been left over in an earlier round this game.
  select array_agg(p.id) into v_pool
  from players p
  where p.active and not p.treat_only
    and not exists (select 1 from island_rounds r
                    where r.season = v_season and not r.undone and p.id = any(r.remaining));
  v_n := coalesce(array_length(v_pool, 1), 0);

  -- Immunity only counts if that player is still in the pool.
  if v_immune is not null and not (v_immune = any(v_pool)) then v_immune := null; end if;

  -- The immune player can't be left over, so at least one other player must be drawn... and enough must exist.
  if p_remaining < 1 or p_remaining >= v_n then raise exception 'INVALID_REMAINING'; end if;

  -- Shuffle everyone else; the immune player goes first.
  select array_agg(x order by secure_random()) into v_order from unnest(v_pool) x where x is distinct from v_immune;
  if v_immune is not null then v_order := array_prepend(v_immune, v_order); end if;

  select count(*) + 1 into v_round from island_rounds where season = v_season and not undone;
  insert into island_rounds (request_id, season, round, picked, remaining, immune_id)
  values (p_request_id, v_season, v_round, v_order[1 : v_n - p_remaining], v_order[v_n - p_remaining + 1 : v_n], v_immune)
  returning id into v_id;

  -- Immunity is used up by this draw.
  update island_meta set immune_id = null where id = 1;

  insert into admin_actions (action_type, player_id, metadata)
  values ('island_round', v_immune, jsonb_build_object('season', v_season, 'round', v_round, 'remaining', p_remaining, 'pool', v_n, 'immune', v_immune is not null));

  return jsonb_build_object('round_id', v_id, 'round', v_round, 'immune_id', v_immune,
    'picked', to_jsonb(v_order[1 : v_n - p_remaining]), 'remaining', to_jsonb(v_order[v_n - p_remaining + 1 : v_n]), 'replayed', false);
end $$;

-- ADD A TREAT-ONLY PLAYER. Name and avatar come from Discord (looked up by the server first).
create or replace function public.admin_add_treat_player(p_discord_user_id text, p_slug text, p_username text,
  p_display_name text, p_avatar_url text, p_candy int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_candy < 0 or p_candy > 100000 then raise exception 'INVALID_COUNT'; end if;
  if exists (select 1 from players where discord_user_id = p_discord_user_id) then raise exception 'PLAYER_EXISTS'; end if;
  insert into players (discord_user_id, slug, discord_username, discord_display_name, discord_avatar_url,
                       profile_synced_at, treat_only, lootbox_status, escaped_via, escaped_at, candy, candy_reached_at)
  values (p_discord_user_id, p_slug, p_username, p_display_name, p_avatar_url,
          now(), true, 'escaped', 'manual', now(), p_candy, clock_timestamp())
  returning id into v_id;
  insert into admin_actions (action_type, player_id, metadata)
  values ('add_treat_player', v_id, jsonb_build_object('discord_user_id', p_discord_user_id, 'username', p_username, 'candy', p_candy));
  return v_id;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Check: should list the new column as false for everyone so far.
select count(*) filter (where treat_only) as treat_only_players, count(*) as all_players from public.players;
