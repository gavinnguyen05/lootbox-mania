-- Lootbox Mania: candy events. Run after 0004-0008. Safe to run again.
--
-- The admin gives (or takes) candy to a chosen group of players in one step,
-- e.g. a costume contest. Every event is recorded with each player's total
-- before, so it can be undone, unless one of them changed candy since.

create table if not exists public.candy_events (
  id          bigint generated always as identity primary key,
  name        text not null default '',
  amount      int not null check (amount <> 0 and amount between -1000 and 1000),
  created_at  timestamptz not null default clock_timestamp(),
  undone      boolean not null default false,
  undone_at   timestamptz,
  players     jsonb not null      -- [{player_id, candy_before, reached_before, candy_after}]
);
create index if not exists candy_events_recent_idx on public.candy_events (id desc);

alter table public.candy_events enable row level security;
revoke all on public.candy_events from anon, authenticated;
grant select, insert, update, delete on public.candy_events to service_role;

-- True if any of these players' candy changed after p_since (treat, manual
-- edit, or another event). Used to refuse undos that would erase later changes.
create or replace function public.candy_changed_since(p_player_ids uuid[], p_since timestamptz, p_except_event bigint default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from treats t where t.player_id = any(p_player_ids) and not t.undone and t.created_at > p_since)
      or exists (select 1 from admin_actions a where a.player_id = any(p_player_ids) and a.action_type = 'set_candy' and a.created_at > p_since)
      or exists (select 1 from candy_events e
                 where not e.undone and e.created_at > p_since and e.id is distinct from p_except_event
                   and exists (select 1 from jsonb_array_elements(e.players) x where (x->>'player_id')::uuid = any(p_player_ids)));
$$;

-- GIVE CANDY to a group. All or nothing. Ties: changing a total counts as reaching it now.
create or replace function public.admin_give_candy(p_player_ids uuid[], p_amount int, p_name text)
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
  if exists (select 1 from players where id = any(p_player_ids) and candy + p_amount < 0) then raise exception 'CANDY_BELOW_ZERO'; end if;

  select jsonb_agg(jsonb_build_object(
           'player_id', id, 'candy_before', candy, 'reached_before', candy_reached_at, 'candy_after', candy + p_amount))
  into v_snapshot
  from players where id = any(p_player_ids);

  update players set candy = candy + p_amount, candy_reached_at = clock_timestamp() where id = any(p_player_ids);

  insert into candy_events (name, amount, players) values (left(trim(coalesce(p_name, '')), 60), p_amount, v_snapshot)
  returning id into v_event;
  insert into admin_actions (action_type, player_id, metadata)
  values ('candy_event', null, jsonb_build_object('event_id', v_event, 'name', left(trim(coalesce(p_name, '')), 60), 'amount', p_amount, 'players', array_length(p_player_ids, 1)));

  return jsonb_build_object('event_id', v_event, 'players', v_snapshot);
end $$;

-- UNDO an event: everyone goes back to their total from before it.
create or replace function public.admin_undo_candy_event(p_event_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_e candy_events%rowtype;
  v_ids uuid[];
begin
  select * into v_e from candy_events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_e.undone then raise exception 'EVENT_ALREADY_UNDONE'; end if;

  select array_agg((x->>'player_id')::uuid order by (x->>'player_id')) into v_ids from jsonb_array_elements(v_e.players) x;
  perform 1 from players where id = any(v_ids) order by id for update;
  if candy_changed_since(v_ids, v_e.created_at, v_e.id) then raise exception 'LATER_CANDY_CHANGES'; end if;

  update players p set candy = (x->>'candy_before')::int, candy_reached_at = (x->>'reached_before')::timestamptz
  from jsonb_array_elements(v_e.players) x
  where p.id = (x->>'player_id')::uuid;

  update candy_events set undone = true, undone_at = clock_timestamp() where id = v_e.id;
  insert into admin_actions (action_type, player_id, metadata)
  values ('undo_candy_event', null, jsonb_build_object('event_id', v_e.id, 'name', v_e.name, 'amount', v_e.amount));
  return jsonb_build_object('event_id', v_e.id, 'players', v_e.players);
end $$;

-- Treat undo (from 0006) now also refuses if a candy event touched this player
-- after the treat, so undoing an old treat can't erase event candy.
create or replace function public.undo_last_treat(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t treats%rowtype;
begin
  perform 1 from players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  select * into v_t from treats where player_id = p_player_id and not undone order by id desc limit 1;
  if not found then raise exception 'NOTHING_TO_UNDO'; end if;
  if exists (select 1 from admin_actions where player_id = p_player_id and action_type = 'set_candy' and created_at > v_t.created_at)
     or exists (select 1 from candy_events e where not e.undone and e.created_at > v_t.created_at
                and exists (select 1 from jsonb_array_elements(e.players) x where (x->>'player_id')::uuid = p_player_id)) then
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

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
