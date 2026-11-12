-- Lootbox Mania: bold candy amounts in Mousey's lines ("0 Candy" -> "**0 Candy**").
-- Run after 0011. Safe to run again (skips lines that are already bold).

update public.neighbor_outcomes
set message = regexp_replace(message, '(\d+) Candy', '**\1 Candy**')
where neighbor_id = 'mousey' and message not like '%**%';
