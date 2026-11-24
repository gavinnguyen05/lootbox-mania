-- Lootbox Mania: Mr Whiskers' 4.5% outcome (30 Candy) offers the orange bar image to copy,
-- same image as Mousey's 4% outcome. Safe to run again.

update public.neighbor_outcomes
set attach_image = '/assets/orangebar.png'
where neighbor_id = 'mrwhiskers' and candy = 30;

-- Check: one row, 4.5, 30, /assets/orangebar.png
select weight, candy, attach_image from public.neighbor_outcomes where neighbor_id = 'mrwhiskers' and attach_image is not null;
