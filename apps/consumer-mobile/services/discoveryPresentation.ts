// Display-only identities: preserve canonical IDs and every discovered location.
type Place = Record<string, any>;
export function cleanlinessValue(value: unknown): number | null {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

export function discoveryPlaceCategory(row: Place): string {
  const tags = row.osm_tags || {};
  if (['fitness_centre', 'sports_centre', 'fitness_station'].includes(tags.leisure)
      || tags.sport === 'martial_arts'
      || /\b(fitness|martial arts|jiu[ -]?jitsu|chang[ -]?moo[ -]?kwan)\b/i.test(String(row.name || ''))) return 'fitness';
  if (['hotel', 'motel', 'hostel', 'guest_house'].includes(tags.tourism)) return 'lodging';
  if (tags.amenity === 'place_of_worship') return 'place_of_worship';
  return String(row.place_type || row.category || 'service').toLowerCase();
}

export function discoveryPlaceName(row: Place): string {
  const tags = row.osm_tags || {};
  const name = String(row.name || '').trim();
  if (name && !/^(unnamed|unknown|untitled)(\s|$)/i.test(name)) return name;
  const knownName = [tags.name, row.business_name, row.brand_name, tags.brand, tags.operator]
    .map(value => String(value || '').trim()).find(Boolean);
  if (knownName) return knownName;
  const category = discoveryPlaceCategory(row).replaceAll('_', ' ');
  const title = category.charAt(0).toUpperCase() + category.slice(1);
  const address = String(row.address || tags['addr:full'] || [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')).trim();
  if (address) return `${title} at ${address}`;
  if (row.latitude != null && row.longitude != null && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))) {
    return `${title} at ${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}`;
  }
  return `${title} · listing ${String(row.location_id || row.id || row.source_external_id || '').slice(0,8) || 'details needed'}`;
}

export function discoveryListingReference(row: Place): string {
  const name = String(row.name || '').trim();
  return !name || /^(unnamed|unknown|untitled)(\s|$)/i.test(name)
    ? `Name needs confirmation · listing ${String(row.location_id || row.id || row.source_external_id || '').slice(0,8)}` : '';
}
