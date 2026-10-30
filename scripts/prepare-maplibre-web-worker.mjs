import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareMapLibreWebWorker(dist = path.resolve('apps/consumer-mobile/dist')) {
  const workerCandidates = [
    path.resolve('apps/consumer-mobile/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'),
    path.resolve('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'),
  ];
  const workerSource = workerCandidates.find(candidate => fs.existsSync(candidate));
  if (!workerSource) {
    if (fs.existsSync(path.join(dist, '_expo/static/js/web'))) {
      throw new Error('MapLibre module worker missing from installed dependencies');
    }
    return false;
  }

  for (const workerRelativePath of [
    '_expo/static/js/web/maplibre-gl-worker.mjs',
    'Kleenest_Production/_expo/static/js/web/maplibre-gl-worker.mjs',
  ]) {
    const workerTarget = path.join(dist, workerRelativePath);
    fs.mkdirSync(path.dirname(workerTarget), { recursive: true });
    fs.copyFileSync(workerSource, workerTarget);
  }
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareMapLibreWebWorker();
}
