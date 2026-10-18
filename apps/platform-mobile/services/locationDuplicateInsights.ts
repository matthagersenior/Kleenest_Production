import type { DuplicateCase, DuplicateLocation, DuplicateStatus } from './locationDedup';

export type ReviewDifference = {
  field: string;
  first: string;
  second: string;
  kind: 'conflict' | 'variant' | 'missing' | 'context';
};

export type ReviewInsight = {
  urgency: 'urgent' | 'high' | 'standard';
  suggestedStatus: DuplicateStatus | null;
  headline: string;
  explanation: string;
  differences: ReviewDifference[];
  supportingSignals: string[];
};

const value = (input: unknown) => input == null ? '' : String(input).trim();
const normalized = (input: unknown) => value(input).toLowerCase().replace(/[^a-z0-9]/g, '');
const phoneKey = (input: unknown) => {
  const digits = value(input).replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
};
const streetAbbreviations: Record<string,string> = {street:'st',road:'rd',avenue:'ave',boulevard:'blvd',drive:'dr',lane:'ln',highway:'hwy',parkway:'pkwy'};
const addressKey = (input: unknown) => value(input).toLowerCase()
  .replace(/\b(north|south|east|west)\b/g, m => m[0])
  .replace(/\b(street|road|avenue|boulevard|drive|lane|highway|parkway)\b/g,
    m => (streetAbbreviations[m] || m))
  .replace(/[^a-z0-9]/g, '');
const websiteKey = (input: unknown) => value(input).toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
const canonicalBrand = (input: unknown) => {
  const key = normalized(input);
  const aliases: Record<string,string> = {
    qt:'quiktrip',quiktrip:'quiktrip',circlek:'circlek',bp:'bp',
    bpgasstation:'bp',seveneleven:'7eleven', '7eleven':'7eleven',
    caseys:'caseys',caseysgeneralstore:'caseys',
  };
  return aliases[key] || key;
};
const display = (v: unknown) => value(v) || 'Not provided';

type FieldName = keyof Pick<DuplicateLocation,'name'|'address'|'city'|'state'|'postal_code'|'phone'|'website'|'place_type'|'brand_name'|'source_dataset'>;
const compare: {key:FieldName; label:string; normalize:(v:unknown)=>string; contextual?:boolean}[] = [
  {key:'name',label:'Business name',normalize:normalized},
  {key:'address',label:'Street address',normalize:addressKey},
  {key:'city',label:'City',normalize:normalized},
  {key:'state',label:'State',normalize:normalized},
  {key:'postal_code',label:'ZIP code',normalize:normalized},
  {key:'place_type',label:'Place category',normalize:normalized},
  {key:'phone',label:'Phone',normalize:phoneKey},
  {key:'website',label:'Website',normalize:websiteKey},
  {key:'brand_name',label:'Brand',normalize:canonicalBrand},
  {key:'source_dataset',label:'Source dataset',normalize:normalized,contextual:true},
];

export function analyzeDuplicateCase(item: DuplicateCase): ReviewInsight {
  const first = item.first;
  const second = item.second;
  if (!first || !second) return {
    urgency:'high',suggestedStatus:null,headline:'Record needs investigation',
    explanation:'One location record is missing or not accessible. Do not resolve this case until the records can be compared.',
    differences:[],supportingSignals:[],
  };
  const differences:ReviewDifference[] = [];
  for (const field of compare) {
    const a = value(first[field.key]), b = value(second[field.key]);
    if (a === b) continue;
    if (!a || !b) {
      differences.push({field:field.label,first:display(a),second:display(b),kind:'missing'});
    } else if (field.normalize(a) === field.normalize(b)) {
      differences.push({field:field.label,first:a,second:b,kind:'variant'});
    } else {
      differences.push({field:field.label,first:a,second:b,kind:field.contextual?'context':'conflict'});
    }
  }
  const signals:string[] = [];
  const dist = item.distance_m === null ? null : Number(item.distance_m);
  const namesSame = Boolean(value(first.name) && value(second.name) && normalized(first.name) === normalized(second.name));
  const addressSame = Boolean(value(first.address) && value(second.address) && addressKey(first.address) === addressKey(second.address));
  const brandA = canonicalBrand(first.brand_name || first.name);
  const brandB = canonicalBrand(second.brand_name || second.name);
  const brandSame = Boolean(brandA && brandB && brandA === brandB);
  const categoriesSame = Boolean(first.place_type && second.place_type && normalized(first.place_type) === normalized(second.place_type));
  const phoneSame = Boolean(phoneKey(first.phone) && phoneKey(second.phone) && phoneKey(first.phone) === phoneKey(second.phone));
  const phoneConflict = Boolean(phoneKey(first.phone) && phoneKey(second.phone) && phoneKey(first.phone) !== phoneKey(second.phone));
  const cityConflict = Boolean(value(first.city) && value(second.city) && normalized(first.city) !== normalized(second.city));
  const categoryConflict = Boolean(first.place_type && second.place_type && !categoriesSame);
  if (namesSame) signals.push('Business names match after punctuation and spacing cleanup');
  if (addressSame) signals.push('Street addresses match after standard abbreviations');
  if (brandSame) signals.push('Brand identity matches');
  if (phoneSame) signals.push('Phone numbers match after formatting cleanup');
  if (dist !== null && dist <= 10) signals.push('Map pins are within 10 metres');
  if (first.source_dataset !== second.source_dataset) signals.push('Two source datasets independently describe this area (not proof of identity)');

  const insight = (urgency:ReviewInsight['urgency'],suggestedStatus:DuplicateStatus|null,
    headline:string,explanation:string):ReviewInsight =>
    ({urgency,suggestedStatus,headline,explanation,differences,supportingSignals:signals});

  if (item.status === 'confirmed' || item.status === 'resolved' || item.status === 'different_businesses' || item.status === 'co_located')
    return insight('standard',null,'Reviewed decision on file','You can reopen or reclassify this case if new evidence appears. No merge occurs here.');
  if (dist === null)
    return insight('high',null,'Find missing map evidence','One or both map positions are unknown. Verify coordinates and the actual premises before choosing an identity.');
  if (dist > 100)
    return insight(dist > 1000?'urgent':'high','needs_geocoding',
      'Investigate conflicting map coordinates',
      `These records are ${Math.round(dist).toLocaleString()} metres apart despite their reported identity or address match. Verify the true entrance/site first; do not merge on name or street alone.`);
  if (cityConflict)
    return insight('high',null,'Verify city and municipal boundary','The reported cities differ. A municipal boundary may explain it; verify address and entrance before making an identity decision.');
  if (categoryConflict || phoneConflict)
    return insight('high',null,'Resolve contradictory business details',
      `${categoryConflict?'The location categories disagree. ':''}${phoneConflict?'Different phone numbers may indicate different tenants or stale information. ':''}Compare the real establishment before confirming a duplicate.`);
  if (addressSame && namesSame && dist <= 20 && (categoriesSame || !first.place_type || !second.place_type))
    return insight('high','confirmed','Likely duplicate — verify and confirm',
      'The cleaned name and street address agree and the pins are very close. Check that these are the same storefront, not two suites, entrances or separate amenities.');
  if (addressSame && brandSame && dist <= 20 && namesSame)
    return insight('high','confirmed','Likely brand duplicate — verify and confirm',
      'Brand, cleaned name and address agree. Confirm it is one establishment before classifying.');
  if (dist <= 15 && addressSame && !namesSame)
    return insight('high','co_located','Check for two tenants in one building',
      'The map positions and street address overlap, but names differ. This could be alternate branding or separate businesses. Keep both until verified.');
  return insight('standard',null,'Compare identity and storefront',
    'There is a possible match but insufficient evidence for a confident action. Verify the current name, entrance, category and source records.');
}
