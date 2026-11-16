-- Lootbox Mania: Candy Island immunity. Run after 0010-0013. Safe to run again.
--
-- The admin picks one player to be immune for the NEXT draw. The draw can never
-- leave them over (at risk): they're drawn first, and immunity is used up by
-- that draw. Undoing the round gives it back; Start over clears it.

alter table public.island_meta   add column if not exists immune_id uuid references public.players(id) on delete set null;
alter table public.island_rounds add column if not exists immune_id uuid references public.players(id) on delete set null;

-- SET IMMUNITY for the next draw (null clears it). Must be active and still on the island.
create or replace function public.island_set_immunity(p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_season int;
begin
  select season into v_season from island_meta where id = 1 for update;
  if p_player_id is not null then
    if not exists (select 1 from players where id = p_player_id and active) then raise exception 'PLAYER_NOT_FOUND'; end if;
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
  where p.active
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

-- UNDO the latest round (replaces 0010's): its left-overs are back, and its immunity is given back.
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
  update island_meta set immune_id = v_r.immune_id where id = 1;
  insert into admin_actions (action_type, player_id, metadata)
  values ('island_undo', null, jsonb_build_object('season', v_season, 'round', v_r.round));
  return jsonb_build_object('round', v_r.round);
end $$;

-- START OVER (replaces 0010's): new game, everyone back, no immunity.
create or replace function public.island_reset()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_season int;
begin
  update island_meta set season = season + 1, immune_id = null where id = 1 returning season into v_season;
  insert into admin_actions (action_type, player_id, metadata)
  values ('island_reset', null, jsonb_build_object('season', v_season));
  return v_season;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
