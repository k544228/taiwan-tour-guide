import { queryOsm, toSimple, around, type Place, type Tags } from './osm';

function kind(t: Tags): string {
  if (t['amenity'] === 'karaoke_box') return 'ktv';
  if (t['cafe'] === 'board_game') return 'boardgame';
  if (t['leisure'] === 'escape_game') return 'escape';
  if (t['leisure'] === 'bowling_alley') return 'bowling';
  if (t['leisure'] === 'amusement_arcade' || t['leisure'] === 'adult_gaming_centre') return 'arcade';
  if (t['amenity'] === 'cinema') return 'cinema';
  return 'other';
}

export async function searchFun(lat: number, lon: number, r: number): Promise<Place[]> {
  const a = around(lat, lon, r);
  const q =
    `[out:json][timeout:25];(` +
    `nwr["amenity"~"^(karaoke_box|cinema)$"]["name"]${a};` +
    `nwr["leisure"~"^(amusement_arcade|adult_gaming_centre|bowling_alley|escape_game)$"]["name"]${a};` +
    `nwr["cafe"="board_game"]["name"]${a};` +
    `);out center 300;`;
  return toSimple(await queryOsm(q), lat, lon, kind);
}
