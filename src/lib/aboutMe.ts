import "server-only";
// "About me" answers from the Candy Island sign-up form (Untitled form.csv).
// Server-only: sent to the logged-in admin page, never bundled into public JavaScript.
import type { AboutMe, Player } from "./types";
import { displayName } from "./names";

/** Who filled out each form response: form name -> the player's Discord display name. */
const FORM_TO_PLAYER: Record<string, string> = {
  "GABRIELLE MAE ORIO": "gabi",
  "justin": "justin",
  "Gavin": "gavin",
  "Lawrence": "lawrence",
  "Chris": "Chrisley",
  "Lilly": "Lilly !",
  "Dana Cao": "daynuh",
  "Ethan": "Ethan",
  "Nathan Le": "*",
  "Kurumi": "Mayor Kurumi",
  "Tobyn": "Mudkip",
  "Jacob": "Tómas",
  "Raymond (ray$) (raythebay) (raytheracist)": "Evo",
  "Aidan Nguyen": "Soos",
  "Michael Tran": "SlightlyUsedEraser",
  "Chloe": "courigxvu",
};

const ANSWERS: AboutMe[] = [
  {"formName": "GABRIELLE MAE ORIO", "age": "21", "color": "BLUE", "food": "BULDAK", "fact": "My wpm in 4th grade was 120", "spend": "debt", "horse": "Larry", "notWin": "Chris"},
  {"formName": "Tobyn", "age": "21", "color": "GREEN", "food": "quiche", "fact": "im a germaphobe", "spend": "discord nitro to boost asian hood", "horse": "The Final Remedy", "notWin": "I don't really care who wins!"},
  {"formName": "justin", "age": "21", "color": "blue", "food": "pasta", "fact": "im gay", "spend": "nothing", "horse": "bethany", "notWin": "I don't really care who wins!"},
  {"formName": "Gavin", "age": "20", "color": "Blue and brown", "food": "Yin Tang Bowl", "fact": "One of my toes is bent the wrong way", "spend": "Taco bell", "horse": "The Final Remedy", "notWin": "Christopher"},
  {"formName": "Lawrence", "age": "21", "color": "Blue", "food": "Wings", "fact": "I like riding rollercoasters and Ferris wheels", "spend": "I’d gamble it", "horse": "Chu hai", "notWin": "chris"},
  {"formName": "Chris", "age": "21", "color": "green", "food": "vietnamese food", "fact": "https://www.youtube.com/watch?v=m0iinLwzmwk", "spend": "I would strategically allocate the $30 into a highly diversified portfolio of speculative assets, leveraging emerging market inefficiencies, compound growth projections, and asymmetric risk-to-reward ratios to maximize long-term capital appreciation. Through calculated exposure to volatile financial instruments and aggressive reinvestment strategies, I anticipate generating generational wealth while simultaneously mitigating downside risk through advanced portfolio optimization.  In other words, I'm putting all $30 on black.", "horse": "the ai horse", "notWin": "tomas."},
  {"formName": "Jacob", "age": "21", "color": "Black", "food": "Taco Bell Creamy Chipotle Crispy Chicken Crunchwrap Slider", "fact": "I have the superpower to read people's minds, but my current superpower is underdeveloped, limiting me to only be able to read my own mind.", "spend": "Double it and pass it to the next person.", "horse": "A tie between MECHA*STORM and The Final Remedy", "notWin": "The first one to target me on this question, if applicable, otherwise idc."},
  {"formName": "Raymond (ray$) (raythebay) (raytheracist)", "age": "21 ni", "color": "Maroon or white or yellow pee", "food": "Any (mainly flatbread from tb)", "fact": "I have lots of siblings", "spend": "Straight to tacobell", "horse": "The dog", "notWin": "Gabby 🪑"},
  {"formName": "Aidan Nguyen", "age": "18", "color": "Orange", "food": "Orange chicken", "fact": "I dapped up Malcolm Todd", "spend": "Double", "horse": "Chu hai", "notWin": "I don't really care who wins!"},
  {"formName": "Lilly", "age": "18", "color": "blue", "food": "sushi", "fact": "I have spent over 2k on popmarts", "spend": "A popmart", "horse": "Chu Hai", "notWin": "Christopher Vu"},
  {"formName": "Dana Cao", "age": "22", "color": "Purple", "food": "Steak", "fact": "I was scouted for semi pro val teams", "spend": "Starbucks", "horse": "Chu Hai", "notWin": "Lawrence"},
  {"formName": "Michael Tran", "age": "21", "color": "#120a8f", "food": "Probably pho or thai curry. Snackwise, gummy candy (in general), orthe pretzel sticks from Trader Joe's", "fact": "I am lowkey autistic about my school's football and men's basketball teams.", "spend": "30 bucks on UCLA winning the college football championship. Realistically, probably graduate application fees", "horse": "Larry, despite the fact he hasn't done anything. However, if it was real life horses, it would probably be Oguri Cap.", "notWin": "I don't really care who wins!"},
  {"formName": "Ethan", "age": "21", "color": "Black", "food": "Burgers", "fact": "I'm the dad of the group.", "spend": "Give it back to the community.", "horse": "Light As A Feather", "notWin": "I don't really care who wins!"},
  {"formName": "Chloe", "age": "21", "color": "blue", "food": "depends on the day but I can safely say probably xiao long bao from din tai fung", "fact": "An unusual fact about myself is my second toe on my feet are longer than my biggest toes.", "spend": "If I won (there is no way this is happening), I would use it to buy boba and share.", "horse": "My favorite derby horse is Light-As-A-Feather because of his \"mom\" tattoo.", "notWin": "I want a woman to win."},
  {"formName": "Nathan Le", "age": "21", "color": "blue", "food": "fettuccine alfredo", "fact": "i love gavin", "spend": "my life", "horse": "mr J", "notWin": "Chris"},
  {"formName": "Kurumi", "age": "20", "color": "Pink & green", "food": "Shrimp (seafood boil or poke or salmon nigiri)", "fact": "I used to order and eat 2 pizzas a week", "spend": "Skincare", "horse": "Idk", "notWin": "I don't really care who wins!"}
];

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
/** Letters and numbers only, so "Mudkip" still matches "Mudkip🍁" if the emoji changes. */
const core = (s: string) => norm(s).replace(/[^\p{L}\p{N}]/gu, "");
function sameName(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true;
  const ca = core(a);
  return ca !== "" && ca === core(b); // names that are only symbols (like "*") must match exactly
}

/** Answers keyed by player id, plus which players have none (for the admin to fix the list above). */
export function aboutMeByPlayer(players: Player[]): { byPlayer: Record<string, AboutMe>; missing: string[] } {
  const byPlayer: Record<string, AboutMe> = {};
  for (const a of ANSWERS) {
    const who = FORM_TO_PLAYER[a.formName];
    if (!who) continue;
    const p = players.find((x) => sameName(displayName(x), who) || sameName(x.discord_display_name ?? "", who));
    if (p) byPlayer[p.id] = a;
  }
  const missing = players.filter((p) => !byPlayer[p.id]).map((p) => displayName(p));
  return { byPlayer, missing };
}
