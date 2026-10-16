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
export interface Intro { extract: string; url: string; translatedFrom: 'zh' | 'en' | null }

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

export class QuotaError extends Error {}

// Optional: put your email here to raise MyMemory's free daily quota from 5,000 to 50,000 characters.
const MYMEMORY_EMAIL = '';
type WikiLang = 'zh' | 'en';
const LEN = { zh: { min: 200, max: 800 }, en: { min: 600, max: 1200 } };
// Text that will be machine-translated is kept shorter to save translation quota.
const SRC = { zh: { min: 200, max: 400 }, en: { min: 600, max: 800 } };
const cache = new Map<string, Intro>();

async function sitelinks(qid: string): Promise<{ zh?: string; en?: string }> {
  const u = new URL('https://www.wikidata.org/w/api.php');
  u.search = new URLSearchParams({ action: 'wbgetentities', ids: qid, props: 'sitelinks', sitefilter: 'zhwiki|enwiki', format: 'json', origin: '*' }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return {};
  const j = (await res.json()) as { entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> };
  const s = j.entities?.[qid]?.sitelinks;
  return { zh: s?.['zhwiki']?.title, en: s?.['enwiki']?.title };
}

async function findTitles(p: Place): Promise<{ zh?: string; en?: string }> {
  const t: { zh?: string; en?: string } = {};
  if (p.wiki && (p.wiki.lang === 'zh' || p.wiki.lang === 'en')) t[p.wiki.lang] = p.wiki.title;
  if (p.wikidata && !(t.zh && t.en)) {
    const s = await sitelinks(p.wikidata);
    t.zh = t.zh ?? s.zh;
    t.en = t.en ?? s.en;
  }
  return t;
}

/** Drop section headings (lines without sentence-ending punctuation) and empty brackets. */
function clean(s: string): string {
  return s.split('\n').map((l) => l.trim()).filter((l) => /[。！？.!?」』”"）)]$/.test(l)).join(' ').replace(/[（(]\s*[）)]/g, '').trim();
}

async function extract(lang: WikiLang, title: string, intro: boolean, max: number): Promise<string> {
  const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  const q: Record<string, string> = {
    action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'plain', exchars: String(max),
    titles: title, redirects: '1', format: 'json', formatversion: '2', origin: '*',
  };
  if (intro) q['exintro'] = '1';
  u.search = new URLSearchParams(q).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = (await res.json()) as { query?: { pages?: { extract?: string }[] } };
  return clean(j.query?.pages?.[0]?.extract ?? '');
}

/** Intro section first; if shorter than `min`, fall back to the start of the full article. Cut at a full sentence. */
async function longText(lang: WikiLang, title: string, min: number, max: number): Promise<string> {
  let t = await extract(lang, title, true, max);
  if (t.length < min) {
    const full = await extract(lang, title, false, max);
    if (full.length > t.length) t = full;
  }
  const m = t.match(/^[\s\S]*[。！？.!?]/);
  return m ? m[0] : t;
}

/** Wikipedia's own Chinese text may be Traditional or Simplified, so always normalise to the UI script. */
async function toUi(text: string, ui: Lang): Promise<string> {
  if (ui === 'zh-TW') return (await import('opencc-js/cn2t')).Converter({ from: 'cn', to: 'twp' })(text);
  if (ui === 'zh-CN') return (await import('opencc-js/t2cn')).Converter({ from: 'twp', to: 'cn' })(text);
  return text;
}

/** MyMemory accepts at most 500 bytes per request, so split on sentence boundaries. */
function chunkText(text: string, maxBytes: number): string[] {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const out: string[] = [];
  let cur = '';
  const add = (s: string) => {
    if (cur && bytes(cur + s) > maxBytes) { out.push(cur); cur = ''; }
    cur += s;
  };
  for (const sent of text.match(/[^。！？.!?]+[。！？.!?]*\s*/g) ?? [text]) {
    let rest = sent;
    while (bytes(rest) > maxBytes) {
      const n = Math.floor(maxBytes / 3);
      add(rest.slice(0, n));
      rest = rest.slice(n);
    }
    add(rest);
  }
  if (cur) out.push(cur);
  return out;
}

const decode = (s: string) => new DOMParser().parseFromString(s, 'text/html').documentElement.textContent ?? s;

async function translate(text: string, from: string, to: string): Promise<string> {
  const out: string[] = [];
  for (const q of chunkText(text, 450)) {
    const params = new URLSearchParams({ q, langpair: `${from}|${to}` });
    if (MYMEMORY_EMAIL) params.set('de', MYMEMORY_EMAIL);
    const res = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, { signal: AbortSignal.timeout(15000) });
    if (res.status === 429) throw new QuotaError();
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = (await res.json()) as { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } };
    const tt = j.responseData?.translatedText ?? '';
    if (j.quotaFinished || Number(j.responseStatus) === 429 || /^MYMEMORY WARNING/i.test(tt)) throw new QuotaError();
    if (Number(j.responseStatus) !== 200 || !tt) throw new Error('translate failed');
    out.push(decode(tt));
  }
  return out.join(' ');
}

const wikiUrl = (lang: WikiLang, title: string) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

async function load(p: Place, ui: Lang): Promise<Intro | null> {
  const target: WikiLang = ui === 'en' ? 'en' : 'zh';
  const other: WikiLang = target === 'en' ? 'zh' : 'en';
  const titles = await findTitles(p);
  const own = titles[target];
  if (own) {
    const text = await longText(target, own, LEN[target].min, LEN[target].max);
    if (text) return { extract: await toUi(text, ui), url: wikiUrl(target, own), translatedFrom: null };
  }
  // No article (or no text) in the UI language: translate the other language's real article instead of inventing content.
  const src = titles[other];
  if (!src) return null;
  let text = await longText(other, src, SRC[other].min, SRC[other].max);
  if (!text) return null;
  if (other === 'zh') text = await toUi(text, 'zh-TW');
  const translated = await translate(text, other === 'zh' ? 'zh-TW' : 'en', ui);
  return { extract: await toUi(translated, ui), url: wikiUrl(other, src), translatedFrom: other };
}

/** Returns null only when neither the Chinese nor the English Wikipedia has a matching article. */
export async function fetchIntro(p: Place, ui: Lang): Promise<Intro | null> {
  const key = `${p.id}|${ui}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await load(p, ui);
  if (r) cache.set(key, r);
  return r;
}
