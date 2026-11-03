-- Lootbox Mania: bonus treats. Run after 0004 and 0005. Safe to run again.
--
-- The admin can give a player extra trick-or-treats (+1 per click), e.g. when
-- a request came in before the reset but got handled after it. Bonus treats
-- never expire. Knocking uses the regular 1-per-window treat first, then a
-- bonus. Undoing a bonus treat gives it back; rerolling keeps it a bonus treat.

alter table public.players add column if not exists bonus_treats int not null default 0 check (bonus_treats between 0 and 99);
alter table public.treats add column if not exists used_bonus boolean not null default false;

-- Treats left right now: the regular one (if unused this window) + bonus treats.
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
    'used_bonus',   t.used_bonus,
    'treats_left',  greatest(0, 1 - (
      select count(*) from treats w
      where w.player_id = t.player_id and w.claim_window = current_claim_window(now())
        and not w.undone and not w.used_bonus)) + p.bonus_treats
  )
  from treats t
  join neighbors n on n.id = t.neighbor_id
  join neighbor_outcomes o on o.id = t.outcome_id
  join players p on p.id = t.player_id
  where t.id = p_treat_id;
$$;

-- Roll one treat. The caller has locked the player row and checked limits.
-- p_used_bonus: this treat spends a bonus treat.
drop function if exists public.roll_treat(uuid, text, uuid, text);
create or replace function public.roll_treat(p_player_id uuid, p_neighbor_id text, p_request_id uuid, p_window text, p_used_bonus boolean)
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
  if p_used_bonus and v_player.bonus_treats < 1 then raise exception 'NO_TREATS_LEFT'; end if;
  select sum(weight) into v_total from neighbor_outcomes where neighbor_id = p_neighbor_id;
  if v_total is null then raise exception 'NEIGHBOR_NOT_FOUND'; end if;

  v_pick := secure_random() * v_total;
  for v_out in select * from neighbor_outcomes where neighbor_id = p_neighbor_id order by sort_order, id loop
    v_acc := v_acc + v_out.weight;
    v_hit := v_out;                 -- falls through to the last outcome on rounding
    exit when v_pick < v_acc;
  end loop;

  insert into treats (request_id, player_id, neighbor_id, outcome_id, candy, claim_window, candy_before, reached_before, used_bonus)
  values (p_request_id, p_player_id, p_neighbor_id, v_hit.id, v_hit.candy, p_window, v_player.candy, v_player.candy_reached_at, p_used_bonus)
  returning id into v_id;

  update players set
    candy = candy + v_hit.candy,
    candy_reached_at = case when v_hit.candy > 0 then clock_timestamp() else candy_reached_at end,
    bonus_treats = bonus_treats - case when p_used_bonus then 1 else 0 end
  where id = p_player_id;

  return treat_result(v_id) || jsonb_build_object('replayed', false);
end $$;

-- TRICK OR TREAT: escaped players only. Regular treat (1 per window) first, then bonus.
create or replace function public.trick_or_treat(p_player_id uuid, p_neighbor_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player players%rowtype;
  v_existing bigint;
  v_window text := current_claim_window(now());
  v_used int;
  v_bonus boolean := false;
begin
  select * into v_player from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  select id into v_existing from treats where request_id = p_request_id;
  if v_existing is not null then return treat_result(v_existing) || jsonb_build_object('replayed', true); end if;

  if not v_player.active then raise exception 'PLAYER_INACTIVE'; end if;
  if v_player.lootbox_status <> 'escaped' then raise exception 'PLAYER_NOT_ESCAPED'; end if;
  if not exists (select 1 from neighbors where id = p_neighbor_id and active) then raise exception 'NEIGHBOR_NOT_FOUND'; end if;

  select count(*) into v_used from treats
  where player_id = p_player_id and claim_window = v_window and not undone and not used_bonus;
  if v_used >= 1 then
    if v_player.bonus_treats < 1 then raise exception 'NO_TREATS_LEFT'; end if;
    v_bonus := true;
  end if;

  return roll_treat(p_player_id, p_neighbor_id, p_request_id, v_window, v_bonus);
end $$;

-- Undo the latest treat. A bonus treat comes back. Refuses after a manual candy edit.
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

  update players set
    candy = v_t.candy_before,
    candy_reached_at = v_t.reached_before,
    bonus_treats = least(99, bonus_treats + case when v_t.used_bonus then 1 else 0 end)
  where id = p_player_id;
  update treats set undone = true, undone_at = clock_timestamp() where id = v_t.id;
  insert into admin_actions (action_type, player_id, metadata)
  values ('undo_treat', p_player_id, jsonb_build_object('treat_id', v_t.id, 'candy', v_t.candy, 'used_bonus', v_t.used_bonus));
  return jsonb_build_object('treat_id', v_t.id, 'neighbor_id', v_t.neighbor_id, 'claim_window', v_t.claim_window, 'used_bonus', v_t.used_bonus);
end $$;

-- REROLL: undo the latest treat and roll again in the same slot (same neighbor,
-- same window, still a bonus treat if it was one).
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
  return roll_treat(p_player_id, v_undone->>'neighbor_id', p_request_id, v_undone->>'claim_window', (v_undone->>'used_bonus')::boolean);
end $$;

-- Give or take one bonus treat (+1 or -1), logged.
create or replace function public.admin_grant_treat(p_player_id uuid, p_delta int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_old int;
  v_new int;
begin
  if p_delta not in (1, -1) then raise exception 'INVALID_COUNT'; end if;
  select bonus_treats into v_old from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  v_new := v_old + p_delta;
  if v_new < 0 then raise exception 'NO_BONUS_TO_REMOVE'; end if;
  if v_new > 99 then raise exception 'TOO_MANY_BONUS'; end if;
  update players set bonus_treats = v_new where id = p_player_id;
  insert into admin_actions (action_type, player_id, metadata)
  values (case when p_delta > 0 then 'grant_treat' else 'remove_treat' end, p_player_id, jsonb_build_object('old', v_old, 'new', v_new));
  return v_new;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
