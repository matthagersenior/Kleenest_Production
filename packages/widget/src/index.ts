import type { KleenestClient } from '@kleenest/sdk-js';

export type FinderWidgetOptions = {
  client: KleenestClient;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  limit?: number;
  title?: string;
};

export function mountKleenestFinder(
  element: HTMLElement,
  options: FinderWidgetOptions,
): () => void {
  const radiusMeters = options.radiusMeters ?? 16093;
  const limit = options.limit ?? 5;
  let disposed = false;

  element.replaceChildren();
  const root = document.createElement('section');
  root.setAttribute('data-kleenest-widget', 'finder');

  const heading = document.createElement('h3');
  heading.textContent = options.title ?? 'Find a restroom';
  root.appendChild(heading);

  const status = document.createElement('p');
  status.textContent = 'Finding Kleenest recommendations…';
  root.appendChild(status);

  const list = document.createElement('ol');
  root.appendChild(list);
  element.appendChild(root);

  options.client.recommendNearby({
    location: { latitude: options.latitude, longitude: options.longitude },
    radiusMeters,
    limit,
  }).then(result => {
    if (disposed) return;
    list.replaceChildren();
    if (!result.recommendations.length) {
      status.textContent = 'No Kleenest restroom recommendations found in this area.';
      return;
    }
    status.textContent = `${result.recommendations.length} Kleenest recommendation${result.recommendations.length === 1 ? '' : 's'}`;
    for (const recommendation of result.recommendations) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = recommendation.deepLink;
      link.textContent = `${recommendation.place.name} — ${recommendation.score}/100`;
      item.appendChild(link);
      const explanation = document.createElement('div');
      explanation.textContent = recommendation.explanation;
      item.appendChild(explanation);
      list.appendChild(item);
    }
  }).catch(error => {
    if (!disposed) status.textContent = error instanceof Error ? error.message : 'Kleenest recommendation failed.';
  });

  return () => {
    disposed = true;
    element.replaceChildren();
  };
}
