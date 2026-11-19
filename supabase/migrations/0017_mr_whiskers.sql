-- Lootbox Mania: neighbor Mr Whiskers, the new default. Run after 0016. Safe to run again.
-- Odds: 55 / 28 / 10 / 4.5 / 1.6 / 0.8 / 0.1 (adds up to 100)
--  -> 0 / 7 / 15 / 30 / 60 / 100 / 350 candy.

insert into public.neighbors (id, name, flag, emoji_code, sort_order, icon_path)
values ('mrwhiskers', 'Mr Whiskers', '', '<:mrwhiskers:1426493568251330560>', 0, '/assets/mrwhiskers.png')
on conflict (id) do update set sort_order = 0, emoji_code = excluded.emoji_code, icon_path = excluded.icon_path;
-- (lowest sort_order = first in the dropdown = the default neighbor)

insert into public.neighbor_outcomes (neighbor_id, weight, candy, message, sort_order)
select 'mrwhiskers', o.weight, o.candy, o.message, o.sort_order
from (values
  (55.0, 0,   '{neighbor} Hisss... no treats for you today, human. **0 Candy** 🚫 (55% chance)', 1),
  (28.0, 7,   '{neighbor} Purr..... you scratch my back, I scratch yours. **7 Candy** for good manners! <:johan:1291256144299560980> (28% chance)', 2),
  (10.0, 15,  '{neighbor} Roses are red, violets are blue, you are so cute, **15 Candy** for uuuu, nya! <:johan:1291256144299560980><:johan:1291256144299560980> 🙂‍↔️ (10% chance)', 3),
  (4.5,  30,  '{neighbor} ✨ Aughhh~ you''ve earned my feline favor! **30 Candy**, don''t waste them :3 <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> ✨ (4.5% chance)', 4),
  (1.6,  60,  '{neighbor} 💎 Haiiii you unboxed a legendary!!!!! **60 Candy**, im gonna BUST! <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 💎 (1.6% chance)', 5),
  (0.8,  100, '{neighbor} 🌟 MEOWZA!!! You found my secret stash under the couch! **100 Candy**, all yours! <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 🌟 (0.8% chance)', 6),
  (0.1,  350, '{neighbor} 🌌 NYAAAAA!!! THE NINE LIVES JACKPOT!!! **350 CANDY**!!! <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 🌌 (0.1% chance)', 7)
) as o(weight, candy, message, sort_order)
where not exists (select 1 from public.neighbor_outcomes where neighbor_id = 'mrwhiskers');

-- Check: Mr Whiskers is first, and his odds add up to 100.
select n.name, n.sort_order, (select sum(weight) from public.neighbor_outcomes where neighbor_id = n.id) as total_odds
from public.neighbors n where n.active order by n.sort_order;
