import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 looks for its worker next to its own module, which no longer exists once bundled.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(mapWorkerUrl);
import { current, flyTarget, openPlace, places, placesById, selectedPlace, status } from '../store';

const NEON = '#b6ff3c';
const MAGENTA = '#ff2bd6';
const CYAN = '#2ce8ff';

const STYLE: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  sky: {
    'sky-color': '#07070b',
    'horizon-color': '#2a0f4a',
    'fog-color': '#07070b',
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 5, 0.6, 7, 0],
  },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': '#11111c' } },
    {
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      paint: { 'fill-color': '#06060c' },
    },
    {
      id: 'borders',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['all', ['<=', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': '#3b2f6b', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.2] },
    },
    {
      id: 'country-labels',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 2.5,
      filter: ['==', ['get', 'class'], 'country'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.25,
      },
      paint: { 'text-color': '#55557a', 'text-halo-color': '#07070b', 'text-halo-width': 1 },
    },
    {
      id: 'city-labels',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 6,
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-offset': [0, 1.2],
      },
      paint: { 'text-color': '#6a6a90', 'text-halo-color': '#07070b', 'text-halo-width': 1 },
    },
  ],
};

function toGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.value.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, size: p.size },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}

function addStationLayers(map: MapLibre) {
  map.addSource('places', {
    type: 'geojson',
    data: toGeoJSON(),
    cluster: true,
    clusterRadius: 38,
    clusterMaxZoom: 7,
    clusterProperties: { stations: ['+', ['get', 'size']] },
  });

  const clusterRadius = ['interpolate', ['linear'], ['get', 'stations'], 1, 9, 50, 15, 500, 24, 3000, 34] as any;

  map.addLayer({
    id: 'cluster-glow',
    type: 'circle',
    source: 'places',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': CYAN,
      'circle-radius': ['*', clusterRadius, 1.7],
      'circle-blur': 1,
      'circle-opacity': 0.35,
    },
  });
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'places',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#0b1a22',
      'circle-radius': clusterRadius,
      'circle-stroke-color': CYAN,
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'places',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'stations'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': CYAN },
  });

  const pointRadius = ['interpolate', ['linear'], ['zoom'], 2, ['min', 6, ['+', 2.5, ['/', ['get', 'size'], 8]]], 8, ['min', 11, ['+', 4, ['/', ['get', 'size'], 5]]]] as any;

  map.addLayer({
    id: 'point-glow',
    type: 'circle',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': NEON, 'circle-radius': ['*', pointRadius, 2.4], 'circle-blur': 1, 'circle-opacity': 0.4 },
  });
  map.addLayer({
    id: 'points',
    type: 'circle',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': NEON, 'circle-radius': pointRadius, 'circle-stroke-color': '#07070b', 'circle-stroke-width': 1 },
  });
  map.addLayer({
    id: 'point-selected',
    type: 'circle',
    source: 'places',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-color': 'transparent',
      'circle-radius': ['+', pointRadius, 6],
      'circle-stroke-color': MAGENTA,
      'circle-stroke-width': 2.5,
    },
  });
}

export function Globe() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new MapLibre({
      container: ref.current!,
      style: STYLE,
      center: [14, 34],
      zoom: window.innerWidth < 700 ? 1.15 : 2.15,
      minZoom: 0.6,
      maxZoom: 12,
      attributionControl: { compact: true },
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();

    // ---- idle auto-spin, paused as soon as the user touches the globe ----
    let spinning = true;
    let resumeTimer: ReturnType<typeof setTimeout>;
    const spin = () => {
      if (!spinning || map.getZoom() > 3 || map.isMoving()) return;
      const c = map.getCenter();
      map.easeTo({ center: [c.lng + 4, c.lat], duration: 1000, easing: (t) => t });
    };
    const halt = () => {
      spinning = false;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        spinning = !selectedPlace.value;
        spin();
      }, 25_000);
    };
    map.on('moveend', spin);
    for (const ev of ['mousedown', 'touchstart', 'wheel'] as const) map.on(ev, halt);

    // ---- playing marker (DOM element so it can pulse with CSS) ----
    const markerEl = document.createElement('div');
    markerEl.className = 'live-marker';
    markerEl.innerHTML = '<span></span><span></span><i></i>';
    const marker = new Marker({ element: markerEl });

    const disposers: (() => void)[] = [];

    map.on('load', () => {
      addStationLayers(map);
      spin();

      disposers.push(
        effect(() => {
          const data = toGeoJSON();
          (map.getSource('places') as GeoJSONSource | undefined)?.setData(data);
        }),
        effect(() => {
          map.setFilter('point-selected', ['==', ['get', 'id'], selectedPlace.value?.id ?? '']);
        }),
      );

      map.on('click', 'clusters', async (e) => {
        halt();
        const f = e.features?.[0];
        if (!f) return;
        const src = map.getSource('places') as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3 });
      });
      map.on('click', 'points', (e) => {
        halt();
        const id = e.features?.[0]?.properties.id;
        if (id) void openPlace(id);
      });
      for (const layer of ['clusters', 'points']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
      }
    });

    disposers.push(
      effect(() => {
        const t = flyTarget.value;
        if (!t) return;
        halt();
        map.flyTo({ center: [t.lon, t.lat], zoom: Math.max(map.getZoom(), t.zoom ?? 4), speed: 1.4, essential: true });
        flyTarget.value = null;
      }),
      effect(() => {
        const st = current.value;
        const p = st && placesById.value.get(st.placeId);
        if (p) marker.setLngLat([p.lon, p.lat]).addTo(map);
        else marker.remove();
        markerEl.classList.toggle('is-live', status.value === 'playing');
      }),
    );

    return () => {
      disposers.forEach((d) => d());
      clearTimeout(resumeTimer);
      map.remove();
    };
  }, []);

  return <div ref={ref} class="globe" />;
}
