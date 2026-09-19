export function isPreciseLocationPermission(permission, platform) {
  if (!permission || (permission.status && permission.status !== 'granted')) return false;
  if (platform === 'android') return permission.android?.accuracy !== 'coarse' && permission.android?.accuracy !== 'none';
  if (platform === 'ios') return permission.ios?.accuracy !== 'reduced';
  return true;
}

export function selectBestLocationFix(fixes) {
  const valid = (fixes || []).filter((fix) => Number.isFinite(fix?.coords?.latitude) && Number.isFinite(fix?.coords?.longitude));
  if (!valid.length) return null;
  return valid.slice().sort((a, b) => {
    const aa = Number.isFinite(a?.coords?.accuracy) ? Number(a.coords.accuracy) : Number.POSITIVE_INFINITY;
    const ba = Number.isFinite(b?.coords?.accuracy) ? Number(b.coords.accuracy) : Number.POSITIVE_INFINITY;
    if (aa !== ba) return aa - ba;
    return Number(b?.timestamp || 0) - Number(a?.timestamp || 0);
  })[0];
}
