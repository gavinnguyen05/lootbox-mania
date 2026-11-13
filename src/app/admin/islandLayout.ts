// Shared layout for the Candy Island picture (used by the stage and the demo).

export const BG = { src: "/assets/stumps.png", width: 1672, height: 941 };

/** Where each avatar's feet go, as % of the picture. Measured from stumps.png (rows of 5, 6, 5). */
export const STUMPS: [number, number][] = [
  [18.24, 36.2], [32.18, 36.2], [45.75, 36.2], [59.69, 36.2], [73.68, 36.2],
  [12.38, 52.28], [26.85, 52.21], [41.09, 52.21], [55.02, 52.21], [68.9, 52.21], [82.95, 52.21],
  [16.81, 69.32], [32.12, 69.32], [47.37, 69.29], [62.44, 69.32], [77.87, 69.32],
];

/** Avatar width, % of picture width. */
export const AVATAR_W = 7.06;

export function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
