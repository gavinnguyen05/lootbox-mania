-- Lootbox Mania: neighbor Mousey McGee, now the default. Run after 0004-0010. Safe to run again.
-- Odds: 38 / 30 / 18 / 9 / 4 / 0.9 / 0.1 (adds up to 100).
-- Also: an outcome can carry an image (attach_image) that the admin page offers
-- as "Copy image" next to "Copy message". Mousey's 4% outcome uses orangebar.png.

alter table public.neighbor_outcomes add column if not exists attach_image text;

insert into public.neighbors (id, name, flag, emoji_code, sort_order, icon_path)
values ('mousey', 'Mousey McGee', '', '<:mousey:1570321919352242186>', 1, '/assets/mousey.png')
on conflict (id) do update set sort_order = 1, emoji_code = excluded.emoji_code, icon_path = excluded.icon_path;
-- (lowest sort_order = first in the dropdown = the default neighbor)

-- Replace any earlier Mousey lines with these.
delete from public.neighbor_outcomes o
where o.neighbor_id = 'mousey' and not exists (select 1 from public.treats t where t.outcome_id = o.id);

insert into public.neighbor_outcomes (neighbor_id, weight, candy, message, sort_order, attach_image)
select 'mousey', o.weight, o.candy, o.message, o.sort_order, o.attach_image
from (values
  (38.0, 0,   '{neighbor} squeak... Mousey McGee quietly shuts the door. 0 Candy 🚫 (38% chance)', 1, null),
  (30.0, 4,   '{neighbor} squeak squeak... Mousey McGee slips you 4 Candy <:johan:1291256144299560980> (30% chance)', 2, null),
  (18.0, 8,   '{neighbor} squeeeak... Mousey McGee quietly hands you 8 Candy <:johan:1291256144299560980><:johan:1291256144299560980> (18% chance)', 3, null),
  (9.0,  14,  '{neighbor} squeak! Mousey McGee looks around and gives you 14 Candy <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 🫨 (9% chance)', 4, null),
  (4.0,  24,  '{neighbor} squeak squeak squeak... Mousey McGee sneaks you 24 Candy <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> ✨ (4% chance)', 5, '/assets/orangebar.png'),
  (0.9,  50,  '{neighbor} SQUE— ...squeak. Mousey McGee gives you 50 Candy <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 💎 (0.9% chance)', 6, null),
  (0.1,  160, '{neighbor} ...squeak? Mousey McGee stares at you for a second, then quietly hands you 160 Candy <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 🌌 (0.1% chance)', 7, null)
) as o(weight, candy, message, sort_order, attach_image)
where not exists (select 1 from public.neighbor_outcomes where neighbor_id = 'mousey');

-- Treat results now include the outcome's image, if it has one.
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

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
