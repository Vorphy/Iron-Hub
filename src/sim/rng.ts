// Deterministyczny PRNG (mulberry32). Stan to jedna liczba 32-bit, więc łatwo go zapisać.
// W sim/ nie wolno używać Math.random() – wyłącznie tego modułu.

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function nextU32(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Liczba z przedziału [0, 1). */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 4294967296;
}

/** Liczba całkowita z przedziału [min, maxExclusive). */
export function nextInt(rng: Rng, min: number, maxExclusive: number): number {
  return min + Math.floor(nextFloat(rng) * (maxExclusive - min));
}
