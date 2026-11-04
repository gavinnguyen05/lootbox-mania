-- Lootbox Mania: neighbor Hearing Aid Harry. Run after 0004-0006. Safe to run again.
-- Odds: 35 / 30 / 20 / 9.9 / 4 / 1 / 0.1 (adds up to 100).
-- Lines use literal candy emojis (1 more per tier) instead of {candies}.

-- Neighbors can have a picture on the admin page (Giovanni uses his flag).
alter table public.neighbors add column if not exists icon_path text;

insert into public.neighbors (id, name, flag, emoji_code, sort_order, icon_path)
values ('harry', 'Hearing Aid Harry', '', '<:harry:1567380052855881728>', 20, '/assets/harry.png')
on conflict (id) do nothing;

insert into public.neighbor_outcomes (neighbor_id, weight, candy, message, sort_order)
select 'harry', o.weight, o.candy, o.message, o.sort_order
from (values
  (35.0, 0,   '{neighbor} FOR SOME REASON, I DON''T LIKE YOU. TAKE YOUR **0 CANDY** AND LEAVE! 😡 (35% chance)', 1),
  (30.0, 3,   '{neighbor} SAY THAT AGAIN? ANYWAYS, HERE''S **3 CANDY** <:johan:1291256144299560980>. WOULD YOU LIKE MY OLD GYM SOCKS TOO? (30% chance)', 2),
  (20.0, 6,   '{neighbor} HUH? YOU GOT **6 CANDY** <:johan:1291256144299560980><:johan:1291256144299560980>? NOT MUCH, BUT IT''LL DO! (20% chance)', 3),
  (9.9,  12,  '{neighbor} COME AGAIN? **12 CANDY** <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980>? NOW WE''RE TALKIN''! (9.9% chance)', 4),
  (4.0,  20,  '{neighbor} ✨ I HAVE NO IDEA WHAT YOU JUST SAID, BUT I''LL GIVE YOU **20 CANDY** <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> IF YOU PROMISE TO LEAVE ME ALONE. ✨ (4% chance)', 5),
  (1.0,  40,  '{neighbor} 💎 EXCUSE ME? **40 CANDY**? I NEED TO RUN TO WALMART TO BUY MORE... <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 💎 (1% chance)', 6),
  (0.1,  130, '{neighbor} 🌌 WHAT IN TARNATION!? **130 CANDY**!? YOU''RE ROBBING ME BLIND!!! <:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980><:johan:1291256144299560980> 🌌 (0.1% chance)', 7)
) as o(weight, candy, message, sort_order)
where not exists (select 1 from public.neighbor_outcomes where neighbor_id = 'harry');
