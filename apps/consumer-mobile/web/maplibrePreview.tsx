import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as maplibregl from 'maplibre-gl';

const DEFAULT_CENTER: [number, number] = [-90.199, 38.627];
const DEFAULT_ZOOM = 11;
const TILE_SIZE = 256;
const OSM_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: TILE_SIZE,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

type Viewport = {
  center: [number, number];
  zoom: number;
  width: number;
  height: number;
};

type WebMapContext = {
  map: maplibregl.Map | null;
  fallback: boolean;
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
};

const MapContext = createContext<WebMapContext | null>(null);

function ensureMaplibreCss() {
  if (typeof document === 'undefined' || document.getElementById('kleenest-maplibre-web-css')) return;
  const style = document.createElement('style');
  style.id = 'kleenest-maplibre-web-css';
  style.textContent = `
    .maplibregl-map{font:12px/20px system-ui,sans-serif;overflow:hidden;position:relative;-webkit-tap-highlight-color:transparent}
    .maplibregl-canvas-container{position:absolute;inset:0}
    .maplibregl-canvas{position:absolute;left:0;top:0}
    .maplibregl-canvas-container.maplibregl-interactive{cursor:grab;user-select:none}
    .maplibregl-canvas-container.maplibregl-touch-zoom-rotate{touch-action:none}
    .maplibregl-marker{position:absolute;top:0;left:0;will-change:transform}
    .maplibregl-ctrl-bottom-right{position:absolute;right:0;bottom:0;z-index:2}
    .maplibregl-ctrl-attrib{background:rgba(255,255,255,.88);padding:0 5px;font-size:10px}
    .maplibregl-ctrl-attrib a{color:#173d2b;text-decoration:none}
  `;
  document.head.appendChild(style);
}

function clampLatitude(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function worldPoint(lng: number, lat: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLat = clampLatitude(lat);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    scale,
  };
}

function projectedOffset(lng: number, lat: number, viewport: Viewport) {
  const center = worldPoint(viewport.center[0], viewport.center[1], viewport.zoom);
  const point = worldPoint(lng, lat, viewport.zoom);
  let dx = point.x - center.x;
  if (dx > center.scale / 2) dx -= center.scale;
  if (dx < -center.scale / 2) dx += center.scale;
  return {
    left: viewport.width / 2 + dx,
    top: viewport.height / 2 + (point.y - center.y),
  };
}

function fallbackTiles(viewport: Viewport) {
  if (!viewport.width || !viewport.height) return [] as Array<{ key: string; url: string; left: number; top: number }>;
  const zoom = Math.max(1, Math.min(18, Math.round(viewport.zoom)));
  const center = worldPoint(viewport.center[0], viewport.center[1], zoom);
  const leftWorld = center.x - viewport.width / 2;
  const topWorld = center.y - viewport.height / 2;
  const firstX = Math.floor(leftWorld / TILE_SIZE) - 1;
  const lastX = Math.floor((leftWorld + viewport.width) / TILE_SIZE) + 1;
  const firstY = Math.max(0, Math.floor(topWorld / TILE_SIZE) - 1);
  const lastY = Math.min(2 ** zoom - 1, Math.floor((topWorld + viewport.height) / TILE_SIZE) + 1);
  const n = 2 ** zoom;
  const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];
  for (let x = firstX; x <= lastX; x += 1) {
    const wrappedX = ((x % n) + n) % n;
    for (let y = firstY; y <= lastY; y += 1) {
      tiles.push({
        key: `${zoom}/${x}/${y}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        left: x * TILE_SIZE - leftWorld,
        top: y * TILE_SIZE - topWorld,
      });
    }
  }
  return tiles;
}

function zoomForBounds(bounds: [number, number, number, number], width: number, height: number) {
  const [west, south, east, north] = bounds;
  if (!width || !height) return DEFAULT_ZOOM;
  for (let zoom = 16; zoom >= 1; zoom -= 1) {
    const a = worldPoint(west, north, zoom);
    const b = worldPoint(east, south, zoom);
    let dx = Math.abs(b.x - a.x);
    dx = Math.min(dx, a.scale - dx);
    const dy = Math.abs(b.y - a.y);
    if (dx <= Math.max(40, width - 56) && dy <= Math.max(40, height - 56)) return zoom;
  }
  return 1;
}

function FallbackRaster({ viewport }: { viewport: Viewport }) {
  const tiles = useMemo(() => fallbackTiles(viewport), [viewport.center[0], viewport.center[1], viewport.zoom, viewport.width, viewport.height]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          style={{ position: 'absolute', width: TILE_SIZE, height: TILE_SIZE, left: tile.left, top: tile.top, userSelect: 'none' }}
        />
      ))}
      <View style={styles.fallbackBanner}>
        <Text style={styles.fallbackText}>MapLibre unavailable · OpenStreetMap fallback</Text>
      </View>
      <View style={styles.fallbackAttribution}>
        <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
      </View>
    </View>
  );
}

export function Map({ children, style, mapStyle }: any) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [fallback, setFallback] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, width: 0, height: 0 });

  useEffect(() => {
    if (!hostRef.current || typeof window === 'undefined') return;
    ensureMaplibreCss();
    setFallback(false);

    if (!maplibregl.supported()) {
      setFallback(true);
      return;
    }

    let instance: maplibregl.Map | null = null;
    let removed = false;
    let loaded = false;
    let mapLoadTimer: number | undefined;
    let idleTimer: number | undefined;

    const failover = () => {
      if (removed) return;
      setMap(null);
      setFallback(true);
      if (mapLoadTimer) window.clearTimeout(mapLoadTimer);
      if (idleTimer) window.clearTimeout(idleTimer);
      removed = true;
      try { instance?.remove(); } catch {}
    };

    try {
      instance = new maplibregl.Map({
        container: hostRef.current,
        style: mapStyle || OSM_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: { compact: true },
        renderWorldCopies: false,
        dragRotate: false,
        touchPitch: false,
      });
      setMap(instance);

      const resize = () => {
        try { instance?.resize(); } catch {}
      };
      const onLoad = () => {
        loaded = true;
        if (mapLoadTimer) window.clearTimeout(mapLoadTimer);
        resize();
        idleTimer = window.setTimeout(() => {
          if (!removed) failover();
        }, 8000);
      };
      const onIdle = () => {
        if (idleTimer) window.clearTimeout(idleTimer);
      };
      const onError = (event: any) => {
        const message = String(event?.error?.message || '');
        const source = String(event?.sourceId || event?.source?.id || '');
        if (!loaded || source === 'osm' || /webgl|canvas|worker|context|unsupported|failed to initialize/i.test(message)) failover();
      };

      instance.once('load', onLoad);
      instance.on('idle', onIdle);
      instance.on('error', onError);
      mapLoadTimer = window.setTimeout(failover, 5000);
      window.requestAnimationFrame(resize);
      window.addEventListener('resize', resize, { passive: true });
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      observer?.observe(hostRef.current);

      return () => {
        observer?.disconnect();
        window.removeEventListener('resize', resize);
        if (mapLoadTimer) window.clearTimeout(mapLoadTimer);
        if (idleTimer) window.clearTimeout(idleTimer);
        try {
          instance?.off('idle', onIdle);
          instance?.off('error', onError);
        } catch {}
        setMap(null);
        if (!removed) {
          removed = true;
          try { instance?.remove(); } catch {}
        }
      };
    } catch {
      failover();
    }
  }, [mapStyle]);

  return (
    <View
      style={[styles.map, style]}
      onLayout={(event) => {
        const width = Number(event.nativeEvent.layout.width || 0);
        const height = Number(event.nativeEvent.layout.height || 0);
        setViewport((current) => width === current.width && height === current.height ? current : { ...current, width, height });
      }}
    >
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, display: fallback ? 'none' : 'block' }} />
      <MapContext.Provider value={{ map, fallback, viewport, setViewport }}>
        {fallback ? <FallbackRaster viewport={viewport} /> : null}
        {children}
      </MapContext.Provider>
    </View>
  );
}

export function Camera({ initialViewState }: any) {
  const context = useContext(MapContext);
  const signature = useMemo(() => JSON.stringify(initialViewState || {}), [initialViewState]);

  useEffect(() => {
    if (!context || !initialViewState) return;
    const { map, fallback, viewport, setViewport } = context;
    const bounds = initialViewState.bounds;
    if (fallback) {
      if (Array.isArray(bounds) && bounds.length === 4) {
        const [west, south, east, north] = bounds.map(Number);
        if ([west, south, east, north].every(Number.isFinite)) {
          setViewport((current) => ({
            ...current,
            center: [(west + east) / 2, (south + north) / 2],
            zoom: zoomForBounds([west, south, east, north], current.width, current.height),
          }));
          return;
        }
      }
      const center = initialViewState.center;
      if (Array.isArray(center) && center.length >= 2) {
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        const zoom = Number(initialViewState.zoom);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          setViewport((current) => ({ ...current, center: [lng, lat], zoom: Number.isFinite(zoom) ? zoom : current.zoom }));
        }
      }
      return;
    }

    if (!map) return;
    const apply = () => {
      if (Array.isArray(bounds) && bounds.length === 4) {
        const [west, south, east, north] = bounds.map(Number);
        if ([west, south, east, north].every(Number.isFinite)) {
          map.fitBounds(new maplibregl.LngLatBounds([west, south], [east, north]), {
            padding: initialViewState.padding || 28,
            duration: 250,
            maxZoom: 16,
          });
          return;
        }
      }
      const center = initialViewState.center;
      if (Array.isArray(center) && center.length >= 2) {
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        const zoom = Number(initialViewState.zoom);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          map.easeTo({ center: [lng, lat], zoom: Number.isFinite(zoom) ? zoom : map.getZoom(), duration: 250 });
        }
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
    return () => { try { map.off('load', apply); } catch {} };
  }, [context?.map, context?.fallback, signature, context?.viewport.width, context?.viewport.height]);

  return null;
}

export function Marker({ children, onPress, lngLat, anchor = 'center', id }: any) {
  const context = useContext(MapContext);
  const rootRef = useRef<Root | null>(null);
  const coordinateKey = Array.isArray(lngLat) ? `${lngLat[0]},${lngLat[1]}` : '';

  useEffect(() => {
    const map = context?.map;
    if (!map || context?.fallback || !Array.isArray(lngLat) || lngLat.length < 2) return;
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
    const marker = new maplibregl.Marker({ element, anchor }).setLngLat([lng, lat]).addTo(map);

    return () => {
      marker.remove();
      root.unmount();
      rootRef.current = null;
    };
  }, [context?.map, context?.fallback, coordinateKey, anchor, id, onPress, children]);

  if (!context?.fallback || !Array.isArray(lngLat) || lngLat.length < 2) return null;
  const lng = Number(lngLat[0]);
  const lat = Number(lngLat[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const point = projectedOffset(lng, lat, context.viewport);
  if (point.left < -80 || point.top < -80 || point.left > context.viewport.width + 80 || point.top > context.viewport.height + 80) return null;
  return (
    <View style={[styles.fallbackMarker, { left: point.left, top: point.top }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={String(id || 'Map location')} onPress={onPress}>
        {children}
      </Pressable>
    </View>
  );
}

export function GeoJSONSource({ id, data, children }: any) {
  const context = useContext(MapContext);
  const map = context?.map;
  const layers = useMemo(
    () => React.Children.toArray(children)
      .filter(React.isValidElement)
      .map((child: any) => child.props)
      .filter((props: any) => props?.id && props?.type),
    [children],
  );
  const signature = useMemo(() => JSON.stringify({ data, layers }), [data, layers]);

  useEffect(() => {
    if (!map || context?.fallback || !id || !data) return;
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
      try {
        map.off('load', sync);
        for (const layer of [...layers].reverse()) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        if (map.getSource(id)) map.removeSource(id);
      } catch {}
    };
  }, [map, context?.fallback, id, signature]);

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
  fallbackMarker: {
    position: 'absolute',
    zIndex: 6,
    transform: [{ translateX: '-50%' as any }, { translateY: '-50%' as any }],
  },
  fallbackBanner: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderWidth: 1,
    borderColor: '#cbd9d0',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  fallbackText: { fontSize: 8, fontWeight: '900', color: '#173d2b' },
  fallbackAttribution: {
    position: 'absolute',
    right: 4,
    bottom: 3,
    backgroundColor: 'rgba(255,255,255,.82)',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  attributionText: { fontSize: 7, color: '#365445' },
});
