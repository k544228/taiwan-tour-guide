import type { Lang } from './i18n';

export interface Place {
  id: string;
  names: { tw: string; cn: string; en: string };
  lat: number;
  lon: number;
  dist: number;
  kind: string;
  wiki?: { lang: string; title: string };
  wikidata?: string;
}
export interface Intro { extract: string; url: string }

type Tags = Record<string, string | undefined>;
interface OsmEl { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Tags }

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const TOURISM = ['attraction', 'museum', 'viewpoint', 'gallery', 'zoo', 'theme_park', 'aquarium'];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

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
  const a = `(around:${Math.round(r)},${lat.toFixed(6)},${lon.toFixed(6)})`;
  const q =
    `[out:json][timeout:25];(` +
    `nwr["tourism"~"^(${TOURISM.join('|')})$"]["name"]${a};` +
    `nwr["historic"]["historic"!~"^(wayside_shrine|wayside_cross|boundary_stone|milestone|memorial)$"]["name"]${a};` +
    `nwr["amenity"="place_of_worship"]["name"]["wikidata"]${a};` +
    `);out center 100;`;
  let lastErr: unknown = new Error('no endpoint');
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
      return toPlaces(json.elements ?? [], lat, lon);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
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

/** OpenStreetMap first; Wikipedia GeoSearch only if OpenStreetMap servers fail. */
export async function searchPlaces(lat: number, lon: number, r: number): Promise<Place[]> {
  try {
    return await overpass(lat, lon, r);
  } catch {
    return await wikiGeo(lat, lon, r);
  }
}

async function sitelinkTitle(qid: string, site: 'zhwiki' | 'enwiki'): Promise<string | null> {
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.search = new URLSearchParams({ action: 'wbgetentities', ids: qid, props: 'sitelinks', sitefilter: site, format: 'json', origin: '*' }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> };
  return j.entities?.[qid]?.sitelinks?.[site]?.title ?? null;
}

/** Returns null when no matching Wikipedia article exists (never guesses by name). */
export async function fetchIntro(p: Place, ui: Lang): Promise<Intro | null> {
  const target = ui === 'en' ? 'en' : 'zh';
  let title: string | null = null;
  if (p.wiki?.lang === target) title = p.wiki.title;
  else if (p.wikidata) title = await sitelinkTitle(p.wikidata, target === 'en' ? 'enwiki' : 'zhwiki');
  if (!title) return null;
  const res = await fetch(`https://${target}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, {
    headers: target === 'zh' ? { 'Accept-Language': ui } : {},
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = (await res.json()) as { type?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  if (j.type === 'disambiguation' || !j.extract) return null;
  return { extract: j.extract, url: j.content_urls?.desktop?.page ?? '' };
}
