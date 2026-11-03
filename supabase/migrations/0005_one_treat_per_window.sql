-- Lootbox Mania: 1 trick-or-treat per claim window (was 2). Run after 0004. Safe to run again.

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
    'treats_left',  greatest(0, 1 - (
      select count(*) from treats w
      where w.player_id = t.player_id and w.claim_window = current_claim_window(now()) and not w.undone))
  )
  from treats t
  join neighbors n on n.id = t.neighbor_id
  join neighbor_outcomes o on o.id = t.outcome_id
  join players p on p.id = t.player_id
  where t.id = p_treat_id;
$$;

-- TRICK OR TREAT: escaped players only, 1 per claim window.
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
  if v_used >= 1 then raise exception 'NO_TREATS_LEFT'; end if;

  return roll_treat(p_player_id, p_neighbor_id, p_request_id, v_window);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
