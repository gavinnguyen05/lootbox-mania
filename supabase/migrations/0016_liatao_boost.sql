-- Lootbox Mania: Liatao boost. Run after 0004-0015. Safe to run again.
--
-- Boosted players get 1.3x candy on every trick-or-treat (automatic) and on
-- event winnings (the admin can switch it off per event). Rounded to the
-- nearest whole candy. Taking candy away is never multiplied.
-- Starts with gabi and Ethan, matched by Discord ID.

alter table public.players add column if not exists liatao boolean not null default false;

update public.players set liatao = true
where discord_user_id in ('498896414903107587',  -- gabi
                          '507781107148914703'); -- Ethan

-- The boost, in one place.
create or replace function public.liatao_amount(p_liatao boolean, p_candy int)
returns int language sql immutable as $$
  select case when p_liatao and p_candy > 0 then round(p_candy * 1.3)::int else p_candy end;
$$;

-- Treat results: what the neighbor gave (base_candy) and what the player got (candy).
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
    'base_candy',   o.candy,
    'boosted',      t.candy <> o.candy,
    'message',      o.message,
    'attach_image', o.attach_image,
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

-- Roll one treat (replaces 0006's): Liatao players get 1.3x, automatically.
create or replace function public.roll_treat(p_player_id uuid, p_neighbor_id text, p_request_id uuid, p_window text, p_used_bonus boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player players%rowtype;
  v_total  numeric;
  v_pick   numeric;
  v_acc    numeric := 0;
  v_out    neighbor_outcomes%rowtype;
  v_hit    neighbor_outcomes%rowtype;
  v_candy  int;
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

  v_candy := liatao_amount(v_player.liatao, v_hit.candy);

  insert into treats (request_id, player_id, neighbor_id, outcome_id, candy, claim_window, candy_before, reached_before, used_bonus)
  values (p_request_id, p_player_id, p_neighbor_id, v_hit.id, v_candy, p_window, v_player.candy, v_player.candy_reached_at, p_used_bonus)
  returning id into v_id;

  update players set
    candy = candy + v_candy,
    candy_reached_at = case when v_candy > 0 then clock_timestamp() else candy_reached_at end,
    bonus_treats = bonus_treats - case when p_used_bonus then 1 else 0 end
  where id = p_player_id;

  return treat_result(v_id) || jsonb_build_object('replayed', false);
end $$;

-- GIVE CANDY (replaces 0009's): optional Liatao boost on winnings, per player.
drop function if exists public.admin_give_candy(uuid[], int, text);
create or replace function public.admin_give_candy(p_player_ids uuid[], p_amount int, p_name text, p_boost boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_snapshot jsonb;
  v_event bigint;
begin
  if p_amount = 0 or p_amount < -1000 or p_amount > 1000 then raise exception 'INVALID_COUNT'; end if;
  if coalesce(array_length(p_player_ids, 1), 0) between 1 and 100 is not true then raise exception 'INVALID_PLAYERS'; end if;
  if (select count(distinct x) from unnest(p_player_ids) x) <> array_length(p_player_ids, 1) then raise exception 'INVALID_PLAYERS'; end if;

  -- Lock in a fixed order so two events at once can't deadlock.
  perform 1 from players where id = any(p_player_ids) order by id for update;
  select count(*) into v_count from players where id = any(p_player_ids) and active;
  if v_count <> array_length(p_player_ids, 1) then raise exception 'PLAYER_NOT_FOUND'; end if;
  if exists (select 1 from players where id = any(p_player_ids)
             and candy + liatao_amount(liatao and p_boost, p_amount) < 0) then raise exception 'CANDY_BELOW_ZERO'; end if;

  select jsonb_agg(jsonb_build_object(
           'player_id', id, 'candy_before', candy, 'reached_before', candy_reached_at,
           'candy_after', candy + liatao_amount(liatao and p_boost, p_amount)))
  into v_snapshot
  from players where id = any(p_player_ids);

  update players set candy = candy + liatao_amount(liatao and p_boost, p_amount), candy_reached_at = clock_timestamp()
  where id = any(p_player_ids);

  insert into candy_events (name, amount, players) values (left(trim(coalesce(p_name, '')), 60), p_amount, v_snapshot)
  returning id into v_event;
  insert into admin_actions (action_type, player_id, metadata)
  values ('candy_event', null, jsonb_build_object('event_id', v_event, 'name', left(trim(coalesce(p_name, '')), 60),
          'amount', p_amount, 'players', array_length(p_player_ids, 1), 'boost', p_boost));

  return jsonb_build_object('event_id', v_event, 'players', v_snapshot);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Check: who has the boost (should be gabi and Ethan).
select coalesce(discord_display_name, discord_username) as player, liatao from public.players where liatao;
