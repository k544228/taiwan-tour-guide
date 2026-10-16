export interface Place {
  id: string;
  names: { tw: string; cn: string; en: string };
  lat: number;
  lon: number;
  dist: number;
  kind: string;
  wiki?: { lang: string; title: string };
  wikidata?: string;
  /** Present only for restaurants / entertainment (no Wikipedia involved). */
  info?: { cuisine?: string; address?: string; hours?: string; phone?: string; website?: string };
}

export type Tags = Record<string, string | undefined>;
export interface OsmEl { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Tags }

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Tries each public Overpass server in order. If all fail, the error lists every server's reason. */
export async function queryOsm(q: string): Promise<OsmEl[]> {
  const errors: string[] = [];
  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = (await res.json()) as { elements?: OsmEl[] };
      return json.elements ?? [];
    } catch (e) {
      errors.push(`${new URL(ep).hostname}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join(' | '));
}

function infoOf(t: Tags): NonNullable<Place['info']> {
  const addr = t['addr:full'] ?? [t['addr:city'], t['addr:district'], t['addr:street'], t['addr:housenumber']].filter(Boolean).join('');
  const site = t['website'] ?? t['contact:website'];
  return {
    cuisine: t['cuisine'], address: addr || undefined, hours: t['opening_hours'],
    phone: t['phone'] ?? t['contact:phone'],
    website: site && /^https?:\/\//i.test(site) ? site : undefined, // only http(s) links are ever shown
  };
}

/** Shared by food.ts and fun.ts: every named match is kept (chain branches included), nearest 40 shown. */
export function toSimple(els: OsmEl[], lat: number, lon: number, kind: (t: Tags) => string): Place[] {
  const out: Place[] = [];
  for (const e of els) {
    const t = e.tags;
    const name = t?.['name'];
    const la = e.lat ?? e.center?.lat;
    const lo = e.lon ?? e.center?.lon;
    if (!t || !name || la === undefined || lo === undefined) continue;
    const zh = t['name:zh'] ?? name;
    out.push({
      id: `${e.type}/${e.id}`,
      names: { tw: t['name:zh-Hant'] ?? zh, cn: t['name:zh-Hans'] ?? zh, en: t['name:en'] ?? name },
      lat: la, lon: lo, dist: haversine(lat, lon, la, lo), kind: kind(t), info: infoOf(t),
    });
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, 40);
}

export const around = (lat: number, lon: number, r: number) => `(around:${Math.round(r)},${lat.toFixed(6)},${lon.toFixed(6)})`;
