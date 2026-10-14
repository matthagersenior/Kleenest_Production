const LOCATION_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirrors public.canonical_location_qr_code's unmaterialized code. A permanent,
// location-owned scan URL is ready without inserting rows during ingestion.
export function canonicalLocationQrCode(locationId) {
  const id=String(locationId||'').trim();
  return LOCATION_UUID.test(id)?'KLOC-'+id.replaceAll('-','').toUpperCase():null;
}
export function canonicalLocationQrUrl(locationId) {
  const code=canonicalLocationQrCode(locationId);
  return code?'https://kleenest.us/qr?code='+encodeURIComponent(code):null;
}
