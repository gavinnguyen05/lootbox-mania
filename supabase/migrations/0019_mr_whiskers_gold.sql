-- Lootbox Mania: Mr Whiskers' 4.5% outcome (30 Candy) offers the gold image to copy,
-- like Mousey's orange bar. The file goes in public/assets/goldbar.png. Safe to run again.

update public.neighbor_outcomes
set attach_image = '/assets/goldbar.png'
where neighbor_id = 'mrwhiskers' and candy = 30;

-- Check: one row, 4.5, 30, /assets/goldbar.png
select weight, candy, attach_image from public.neighbor_outcomes where neighbor_id = 'mrwhiskers' and attach_image is not null;
