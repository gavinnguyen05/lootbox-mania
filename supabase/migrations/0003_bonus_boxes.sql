-- Lootbox Mania: bonus boxes. Run once, after 0001 and 0002. Safe to run again.
--
-- The admin can give a player extra boxes (+1 per click). Bonus boxes never
-- expire. Opening uses the 2 regular boxes for the current window first, then
-- bonus boxes. Undoing a roll that used a bonus box gives it back.

alter table public.players
  add column if not exists bonus_boxes int not null default 0
  check (bonus_boxes between 0 and 99);

alter table public.lootbox_rolls
  add column if not exists used_bonus boolean not null default false;

-- Public pages show "boxes ready", which includes bonus boxes.
grant select (bonus_boxes) on public.players to anon, authenticated;
grant select (used_bonus) on public.lootbox_rolls to anon, authenticated;

-- ============================================================
-- OPEN ONE LOOTBOX (same as 0001, plus bonus boxes)
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
  v_bonus     boolean := false;
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

  -- Regular boxes first (2 per window, bonus rolls don't count), then bonus boxes.
  select count(*) into v_used from lootbox_rolls
  where player_id = p_player_id and claim_window = v_window and not undone and not used_bonus;
  if v_used >= 2 then
    if v_player.bonus_boxes < 1 then raise exception 'NO_BOXES_LEFT'; end if;
    v_bonus := true;
  end if;

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
    was_new_item, triggered_roberts_rule, triggered_completion, triggered_reset, state_before, used_bonus
  ) values (
    p_request_id, p_player_id, v_item.id, v_item.rarity, v_window, v_after,
    v_before = 0, v_roberts, v_complete, v_reset, v_snapshot, v_bonus
  ) returning id into v_roll_id;

  if v_bonus then
    update players set bonus_boxes = bonus_boxes - 1 where id = p_player_id;
  end if;

  return roll_result(v_roll_id) || jsonb_build_object('replayed', false);
end $$;

-- ============================================================
-- UNDO LAST ROLL (same as 0001, plus bonus refund)
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
  -- A roll paid for with a bonus box gives the bonus box back.
  if v_roll.used_bonus then
    update players set bonus_boxes = least(bonus_boxes + 1, 99) where id = p_player_id;
  end if;
  update lootbox_rolls set undone = true, undone_at = now() where id = v_roll.id;

  insert into admin_actions (action_type, player_id, metadata)
  values ('undo_roll', p_player_id, jsonb_build_object('roll_id', v_roll.id, 'item_id', v_roll.item_id));

  return jsonb_build_object('roll_id', v_roll.id, 'item_id', v_roll.item_id);
end $$;

-- ============================================================
-- GIVE OR TAKE ONE BONUS BOX (+1 or -1), logged
-- ============================================================
create or replace function public.admin_grant_box(p_player_id uuid, p_delta int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_old int;
  v_new int;
begin
  if p_delta not in (1, -1) then raise exception 'INVALID_COUNT'; end if;
  select bonus_boxes into v_old from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  v_new := v_old + p_delta;
  if v_new < 0 then raise exception 'NO_BONUS_TO_REMOVE'; end if;
  if v_new > 99 then raise exception 'TOO_MANY_BONUS'; end if;

  update players set bonus_boxes = v_new where id = p_player_id;
  insert into admin_actions (action_type, player_id, metadata)
  values (case when p_delta > 0 then 'grant_box' else 'remove_box' end, p_player_id,
          jsonb_build_object('old', v_old, 'new', v_new));
  return v_new;
end $$;

-- Only the server (service role) may call any of these.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
