import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 looks for its worker next to its own module, which no longer exists once bundled.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { ACCENTS, reducedMotion, settings } from '../settings';
import { current, flyTarget, openPlace, places, placesById, selectedPlace, status } from '../store';
import { NIGHT_BANDS, nightGeoJSON, subsolarPoint } from '../sun';
import { recs } from '../taste';

setWorkerUrl(mapWorkerUrl);

const MAGENTA = '#ff2bd6';
const CYAN = '#2ce8ff';

/** Base map colours. "Real" mode paints the day palette and darkens the night side on top. */
const PALETTES = {
  night: { land: '#11111c', water: '#06060c', border: '#3b2f6b', label: '#55557a', city: '#6a6a90' },
  day: { land: '#1c2a45', water: '#0a2647', border: '#4c66a8', label: '#8ea5cf', city: '#a3b6dc' },
};

// Each band adds a little darkness; together they reach ~60% at full night.
const NIGHT_LAYERS = NIGHT_BANDS.map((alt) => ({ alt, opacity: 0.088 }));

const STYLE: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    night: { type: 'geojson', data: nightGeoJSON() },
  },
  sky: {
    'sky-color': '#07070b',
    'horizon-color': '#2a0f4a',
    'fog-color': '#07070b',
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 5, 0.6, 7, 0],
  },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': PALETTES.day.land } },
    {
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      paint: { 'fill-color': PALETTES.day.water },
    },
    {
      id: 'borders',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['all', ['<=', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': PALETTES.day.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.2] },
    },
    // Night side: four stacked caps (sunset, civil, nautical, astronomical twilight) give a soft gradient.
    ...NIGHT_LAYERS.map(({ alt, opacity }) => ({
      id: `night${alt}`,
      type: 'fill' as const,
      source: 'night',
      filter: ['==', ['get', 'alt'], alt] as any,
      paint: { 'fill-color': '#020208', 'fill-opacity': opacity, 'fill-antialias': false },
    })),
    {
      id: 'terminator',
      type: 'line',
      source: 'night',
      filter: ['==', ['get', 'alt'], 0],
      paint: { 'line-color': '#ff9b3d', 'line-opacity': 0.35, 'line-width': 1.5, 'line-blur': 2 },
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
      paint: { 'text-color': PALETTES.day.label, 'text-halo-color': '#07070b', 'text-halo-width': 1 },
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
      paint: { 'text-color': PALETTES.day.city, 'text-halo-color': '#07070b', 'text-halo-width': 1 },
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
  const accent = ACCENTS[settings.value.accent].color;
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

  // Zoom expressions must be the top-level interpolate, so scaled variants are built per stop.
  const pointRadius = (scale = 1, add = 0) =>
    [
      'interpolate', ['linear'], ['zoom'],
      2, ['+', ['*', ['min', 6, ['+', 2.5, ['/', ['get', 'size'], 8]]], scale], add],
      8, ['+', ['*', ['min', 11, ['+', 4, ['/', ['get', 'size'], 5]]], scale], add],
    ] as any;

  map.addLayer({
    id: 'point-glow',
    type: 'circle',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': accent, 'circle-radius': pointRadius(2.4), 'circle-blur': 1, 'circle-opacity': 0.4 },
  });
  map.addLayer({
    id: 'points',
    type: 'circle',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': accent, 'circle-radius': pointRadius(), 'circle-stroke-color': '#07070b', 'circle-stroke-width': 1 },
  });
  map.addLayer({
    id: 'point-selected',
    type: 'circle',
    source: 'places',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-color': 'transparent',
      'circle-radius': pointRadius(1, 6),
      'circle-stroke-color': MAGENTA,
      'circle-stroke-width': 2.5,
    },
  });
}

/** Applies the day/night mode: palette + whether the live night overlay is shown. */
function applyDayNight(map: MapLibre, mode: 'real' | 'night' | 'day') {
  const pal = mode === 'night' ? PALETTES.night : PALETTES.day;
  map.setPaintProperty('land', 'background-color', pal.land);
  map.setPaintProperty('water', 'fill-color', pal.water);
  map.setPaintProperty('borders', 'line-color', pal.border);
  map.setPaintProperty('country-labels', 'text-color', pal.label);
  map.setPaintProperty('city-labels', 'text-color', pal.city);
  const vis = mode === 'real' ? 'visible' : 'none';
  for (const { alt } of NIGHT_LAYERS) map.setLayoutProperty(`night${alt}`, 'visibility', vis);
  map.setLayoutProperty('terminator', 'visibility', vis);
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
      const s = settings.value;
      if (!spinning || !s.autoSpin || reducedMotion.value || map.getZoom() > 3 || map.isMoving()) return;
      const c = map.getCenter();
      map.easeTo({ center: [c.lng + 2 * s.spinSpeed, c.lat], duration: 1000, easing: (t) => t });
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

    // ---- markers: now playing, the sun, and "For You" recommendations ----
    const markerEl = document.createElement('div');
    markerEl.className = 'live-marker';
    markerEl.innerHTML = '<span></span><span></span><i></i>';
    const marker = new Marker({ element: markerEl });

    const sunEl = document.createElement('div');
    sunEl.className = 'sun-marker';
    sunEl.title = 'The sun is directly overhead here';
    const sunMarker = new Marker({ element: sunEl });

    let recMarkers: Marker[] = [];

    const disposers: (() => void)[] = [];

    const updateSun = () => {
      const src = map.getSource('night') as GeoJSONSource | undefined;
      src?.setData(nightGeoJSON());
      const sun = subsolarPoint();
      sunMarker.setLngLat([sun.lon, sun.lat]);
    };
    const sunTimer = setInterval(updateSun, 60_000);

    // 'style.load' (not 'load'): station dots shouldn't wait for every basemap tile to download.
    map.once('style.load', () => {
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
        effect(() => {
          const s = settings.value;
          applyDayNight(map, s.dayNight);
          if (s.dayNight === 'real') {
            updateSun();
            sunMarker.addTo(map);
          } else {
            sunMarker.remove();
          }
          const vis = s.labels ? 'visible' : 'none';
          map.setLayoutProperty('country-labels', 'visibility', vis);
          map.setLayoutProperty('city-labels', 'visibility', vis);
          const accent = ACCENTS[s.accent].color;
          map.setPaintProperty('points', 'circle-color', accent);
          map.setPaintProperty('point-glow', 'circle-color', accent);
          if (s.autoSpin) spin();
        }),
        effect(() => {
          for (const m of recMarkers) m.remove();
          recMarkers = [];
          const s = settings.value;
          if (!s.showForYou || !s.recommendations) return;
          const byPlace = new Map<string, string[]>();
          for (const r of recs.value) {
            const list = byPlace.get(r.station.placeId) ?? [];
            list.push(r.station.title);
            byPlace.set(r.station.placeId, list);
          }
          for (const [placeId, titles] of byPlace) {
            const p = placesById.value.get(placeId);
            if (!p) continue;
            const el = document.createElement('button');
            el.className = 'rec-marker';
            el.title = `For you: ${titles.join(', ')}`;
            el.setAttribute('aria-label', `Recommended in ${p.title}: ${titles.join(', ')}`);
            el.innerHTML = '<span></span><i></i>';
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              halt();
              void openPlace(placeId, true);
            });
            recMarkers.push(new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map));
          }
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
        const opts = { center: [t.lon, t.lat] as [number, number], zoom: Math.max(map.getZoom(), t.zoom ?? 4) };
        if (reducedMotion.value) map.jumpTo(opts);
        else map.flyTo({ ...opts, speed: 1.4, essential: true });
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
      clearInterval(sunTimer);
      map.remove();
    };
  }, []);

  return <div ref={ref} class="globe" />;
}
