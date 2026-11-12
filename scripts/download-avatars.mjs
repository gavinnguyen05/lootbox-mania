// Downloads every active player's Discord profile picture into ./avatars as PNGs.
// Run from the project folder:  node --env-file=.env.local scripts/download-avatars.mjs
// Uses the public read key from .env.local and the avatar links the site already stores.

import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing Supabase settings. Run this from the project folder with: node --env-file=.env.local scripts/download-avatars.mjs");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/players?select=slug,discord_display_name,discord_username,discord_avatar_url&order=discord_display_name`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`Couldn't read players (${res.status}). Check .env.local.`);
  process.exit(1);
}
const players = await res.json();

await mkdir("avatars", { recursive: true });
const used = new Set();
let saved = 0;

for (const p of players) {
  const name = p.discord_display_name || p.discord_username || p.slug;
  // Safe file name: keep letters, numbers, spaces, dots, dashes; fall back to the page slug.
  let file = name.normalize("NFKC").replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || p.slug;
  while (used.has(file.toLowerCase())) file += "-2";
  used.add(file.toLowerCase());

  if (!p.discord_avatar_url) {
    console.log(`skip  ${name} (no profile picture saved; try Sync Discord profiles in admin)`);
    continue;
  }
  // Ask Discord for the largest PNG instead of the 256px the site uses.
  const src = new URL(p.discord_avatar_url);
  if (src.searchParams.has("size")) src.searchParams.set("size", "1024");

  const img = await fetch(src);
  if (!img.ok) {
    console.log(`fail  ${name} (Discord said ${img.status})`);
    continue;
  }
  await writeFile(`avatars/${file}.png`, Buffer.from(await img.arrayBuffer()));
  console.log(`saved avatars/${file}.png`);
  saved++;
}
console.log(`\nDone: ${saved} of ${players.length} saved to the avatars folder.`);
