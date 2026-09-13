import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StyleSheet, View } from 'react-native';
import * as maplibregl from 'maplibre-gl';

const DEFAULT_CENTER: [number, number] = [-90.199, 38.627];
const OSM_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const MapContext = createContext<maplibregl.Map | null>(null);

function ensureMaplibreCss() {
  if (typeof document === 'undefined' || document.getElementById('kleenest-maplibre-web-css')) return;
  const style = document.createElement('style');
  style.id = 'kleenest-maplibre-web-css';
  style.textContent = `
    .maplibregl-map{font:12px/20px system-ui,sans-serif;overflow:hidden;position:relative;-webkit-tap-highlight-color:transparent}
    .maplibregl-canvas{position:absolute;left:0;top:0}
    .maplibregl-canvas-container.maplibregl-interactive{cursor:grab;user-select:none}
    .maplibregl-canvas-container.maplibregl-touch-zoom-rotate{touch-action:none}
    .maplibregl-marker{position:absolute;top:0;left:0;will-change:transform}
    .maplibregl-ctrl-bottom-right{position:absolute;right:0;bottom:0;z-index:2}
    .maplibregl-ctrl-attrib{background:rgba(255,255,255,.8);padding:0 5px;font-size:10px}
    .maplibregl-ctrl-attrib a{color:#173d2b;text-decoration:none}
  `;
  document.head.appendChild(style);
}

export function Map({ children, style, mapStyle }: any) {
  const hostRef = useRef<any>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!hostRef.current || typeof window === 'undefined') return;
    ensureMaplibreCss();
    const instance = new maplibregl.Map({
      container: hostRef.current as HTMLElement,
      style: mapStyle || OSM_STYLE,
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: { compact: true },
      renderWorldCopies: false,
      dragRotate: false,
      touchPitch: false,
    });
    setMap(instance);

    const resize = () => instance.resize();
    window.addEventListener('resize', resize, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(hostRef.current as HTMLElement);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      setMap(null);
      instance.remove();
    };
  }, [mapStyle]);

  return (
    <View style={[styles.map, style]}>
      <View ref={hostRef} style={styles.host} />
      <MapContext.Provider value={map}>{children}</MapContext.Provider>
    </View>
  );
}

export function Camera({ initialViewState }: any) {
  const map = useContext(MapContext);
  const signature = useMemo(() => JSON.stringify(initialViewState || {}), [initialViewState]);

  useEffect(() => {
    if (!map || !initialViewState) return;
    const apply = () => {
      const bounds = initialViewState.bounds;
      if (Array.isArray(bounds) && bounds.length === 4) {
        const [west, south, east, north] = bounds.map(Number);
        if ([west, south, east, north].every(Number.isFinite)) {
          map.fitBounds(
            new maplibregl.LngLatBounds([west, south], [east, north]),
            {
              padding: initialViewState.padding || 28,
              duration: 250,
              maxZoom: 16,
            },
          );
          return;
        }
      }
      const center = initialViewState.center;
      if (Array.isArray(center) && center.length >= 2) {
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        const zoom = Number(initialViewState.zoom);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          map.easeTo({
            center: [lng, lat],
            zoom: Number.isFinite(zoom) ? zoom : map.getZoom(),
            duration: 250,
          });
        }
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
    return () => { map.off('load', apply); };
  }, [map, signature]);

  return null;
}

export function Marker({ children, onPress, lngLat, anchor = 'center', id }: any) {
  const map = useContext(MapContext);
  const rootRef = useRef<Root | null>(null);
  const coordinateKey = Array.isArray(lngLat) ? `${lngLat[0]},${lngLat[1]}` : '';

  useEffect(() => {
    if (!map || !Array.isArray(lngLat) || lngLat.length < 2) return;
    const lng = Number(lngLat[0]);
    const lat = Number(lngLat[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    const element = document.createElement('button');
    element.type = 'button';
    element.setAttribute('aria-label', String(id || 'Map location'));
    element.style.border = '0';
    element.style.background = 'transparent';
    element.style.padding = '0';
    element.style.cursor = 'pointer';
    element.style.touchAction = 'manipulation';
    element.onclick = (event) => {
      event.stopPropagation();
      onPress?.(event);
    };

    const root = createRoot(element);
    rootRef.current = root;
    root.render(<>{children}</>);

    const marker = new maplibregl.Marker({ element, anchor })
      .setLngLat([lng, lat])
      .addTo(map);

    return () => {
      marker.remove();
      root.unmount();
      rootRef.current = null;
    };
  }, [map, coordinateKey, anchor, id, onPress, children]);

  return null;
}

export function GeoJSONSource({ id, data, children }: any) {
  const map = useContext(MapContext);
  const layers = useMemo(
    () => React.Children.toArray(children)
      .filter(React.isValidElement)
      .map((child: any) => child.props)
      .filter((props: any) => props?.id && props?.type),
    [children],
  );
  const signature = useMemo(() => JSON.stringify({ data, layers }), [data, layers]);

  useEffect(() => {
    if (!map || !id || !data) return;

    const sync = () => {
      const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (existing) existing.setData(data);
      else map.addSource(id, { type: 'geojson', data });

      for (const layer of layers) {
        if (map.getLayer(layer.id)) continue;
        map.addLayer({
          id: layer.id,
          type: layer.type,
          source: id,
          paint: layer.paint,
          layout: layer.layout,
          minzoom: layer.minzoom,
          maxzoom: layer.maxzoom,
        } as any);
      }
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);

    return () => {
      map.off('load', sync);
      for (const layer of [...layers].reverse()) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, id, signature]);

  return null;
}

export function Layer() {
  return null;
}

const styles = StyleSheet.create({
  map: {
    minHeight: 260,
    backgroundColor: '#e3ece6',
    position: 'relative',
    overflow: 'hidden',
  },
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
