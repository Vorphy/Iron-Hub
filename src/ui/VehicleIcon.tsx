import { gfxData, gfxOn, palKey, spriteStyle } from '../render/gfx/gfx';
import { engineDef, wagonDef } from '../sim/trains/vehicles';

/** Kolor (przekolorowanie TTD) lokomotywy; wagony luzem – w kolorze pierwszej lokomotywy z atlasu. */
export function vehiclePal(engine?: string): number {
  if (!gfxOn()) return 0;
  const engines = gfxData().engines;
  return (engine && engines[engine]?.pal) || Object.values(engines)[0]?.pal || 0;
}

/**
 * Pojazd z boku (jak w zajezdni OpenTTD – przodem w lewo) z grafiki OpenGFX; bez atlasu – kolorowa
 * etykieta z nazwą. `pal` – kolor składu (lokomotywy prowadzącej).
 */
export function VehicleIcon({
  type,
  engine,
  pal,
  loaded = false,
}: {
  type: string;
  engine: boolean;
  pal: number;
  loaded?: boolean;
}) {
  const def = engine ? engineDef(type) : wagonDef(type);
  let style: Record<string, string> | null = null;
  if (gfxOn()) {
    if (engine) {
      const e = gfxData().engines[type];
      if (e) style = spriteStyle(palKey(e.base + (e.views === 8 ? 6 : 2), pal));
    } else {
      const w = gfxData().wagons[type];
      if (w) style = spriteStyle(palKey((loaded && w.full ? w.full : w.base) + 2, pal));
    }
  }
  if (style) return <span class="veh-sprite" style={style} />;
  return (
    <span class={`chip static ${engine ? 'engine' : ''}`} style={{ background: def?.color }}>
      {engine ? def?.name : def?.name.split(' ').pop()}
    </span>
  );
}
