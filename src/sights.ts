import { queryOsm, haversine, around, type Place, type Tags, type OsmEl } from './osm';

// Same logic as the first working version; only moved out of api.ts.
const TOURISM = ['attraction', 'museum', 'viewpoint', 'gallery', 'zoo', 'theme_park', 'aquarium'];

function kindOf(t: Tags): string {
  if (t['tourism'] && TOURISM.includes(t['tourism'])) return t['tourism'];
  if (t['historic']) return 'historic';
  if (t['amenity'] === 'place_of_worship') return 'worship';
  return 'other';
}

function parseWiki(tag?: string): Place['wiki'] {
  if (!tag) return undefined;
  const i = tag.indexOf(':');
  const lang = tag.slice(0, i);
  return i > 0 && /^[a-z-]{2,12}$/.test(lang) ? { lang, title: tag.slice(i + 1) } : undefined;
}

function toPlaces(els: OsmEl[], lat: number, lon: number): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const e of els) {
    const t = e.tags;
    const name = t?.['name'];
    const la = e.lat ?? e.center?.lat;
    const lo = e.lon ?? e.center?.lon;
    if (!t || !name || la === undefined || lo === undefined || seen.has(name)) continue;
    seen.add(name);
    const zh = t['name:zh'] ?? name;
    const qid = t['wikidata'];
    out.push({
      id: `${e.type}/${e.id}`,
      names: { tw: t['name:zh-Hant'] ?? zh, cn: t['name:zh-Hans'] ?? zh, en: t['name:en'] ?? name },
      lat: la, lon: lo, dist: haversine(lat, lon, la, lo), kind: kindOf(t),
      wiki: parseWiki(t['wikipedia']),
      wikidata: qid && /^Q\d+$/.test(qid) ? qid : undefined,
    });
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, 40);
}

async function overpass(lat: number, lon: number, r: number): Promise<Place[]> {
  const a = around(lat, lon, r);
  const q =
    `[out:json][timeout:25];(` +
    `nwr["tourism"~"^(${TOURISM.join('|')})$"]["name"]${a};` +
    `nwr["historic"]["historic"!~"^(wayside_shrine|wayside_cross|boundary_stone|milestone|memorial)$"]["name"]${a};` +
    `nwr["amenity"="place_of_worship"]["name"]["wikidata"]${a};` +
    `);out center 100;`;
  return toPlaces(await queryOsm(q), lat, lon);
}

async function wikiGeo(lat: number, lon: number, r: number): Promise<Place[]> {
  const u = new URL('https://zh.wikipedia.org/w/api.php');
  u.search = new URLSearchParams({
    action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: String(Math.min(Math.round(r), 10000)),
    gslimit: '40', format: 'json', formatversion: '2', origin: '*',
  }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = (await res.json()) as { query?: { geosearch?: { pageid: number; title: string; lat: number; lon: number; dist: number }[] } };
  return (j.query?.geosearch ?? []).map((g) => ({
    id: `wp/${g.pageid}`, names: { tw: g.title, cn: g.title, en: g.title },
    lat: g.lat, lon: g.lon, dist: g.dist, kind: 'other', wiki: { lang: 'zh', title: g.title },
  }));
}

/** OpenStreetMap first; Wikipedia GeoSearch only if all OpenStreetMap servers fail. */
export async function searchSights(lat: number, lon: number, r: number): Promise<Place[]> {
  try {
    return await overpass(lat, lon, r);
  } catch {
    return await wikiGeo(lat, lon, r);
  }
}
