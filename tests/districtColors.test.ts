import { describe, expect, it } from 'vitest';
import { newTown } from '../src/sim/economy/town';
import { districtColors } from '../src/render/districtTint';

describe('kolory dzielnic', () => {
  it('sąsiednie dzielnice (także z innego miasta) mają różne kolory; jednodzielnicowe miasta bez koloru', () => {
    // Metropolia 4×4 dzielnice co 16 kafelków i drugie miasto tuż obok.
    const big = newTown(1, 'Bocznica', 20, 20);
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) if (gx || gy) big.districts.push({ name: `D${gx}${gy}`, x: 20 + gx * 16, y: 20 + gy * 16 });
    }
    const other = newTown(2, 'Iskrzyn', 84, 20);
    other.districts.push({ name: 'Zatorze', x: 84, y: 36 });
    const lone = newTown(3, 'Kolejno', 200, 200);
    const colors = districtColors([big, other, lone]);
    expect(colors.has(lone)).toBe(false);
    const all = [big, other].flatMap((t) => t.districts.map((d, k) => ({ ...d, color: colors.get(t)![k]! })));
    for (const a of all) {
      for (const b of all) {
        if (a !== b && Math.abs(a.x - b.x) <= 16 && Math.abs(a.y - b.y) <= 16) expect(a.color).not.toBe(b.color);
      }
    }
    // Dołożenie dzielnicy nie zmienia kolorów starszych.
    const before = colors.get(big)!;
    big.districts.push({ name: 'Nowa', x: 84, y: 84 });
    expect(districtColors([big, other, lone]).get(big)!.slice(0, before.length)).toEqual(before);
  });
});
