import { queryOsm, toSimple, around, type Place, type Tags } from './osm';

const kind = (t: Tags) => (t['amenity'] === 'fast_food' ? 'fast_food' : t['amenity'] === 'food_court' ? 'food_court' : 'restaurant');

export async function searchFood(lat: number, lon: number, r: number): Promise<Place[]> {
  const a = around(lat, lon, r);
  const q = `[out:json][timeout:25];(nwr["amenity"~"^(restaurant|fast_food|food_court)$"]["name"]${a};);out center 300;`;
  return toSimple(await queryOsm(q), lat, lon, kind);
}
