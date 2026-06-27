import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { CandidateMachine, LatLng } from '../types';

// Free vector tiles + style, no API key required.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const FALLBACK_CENTER: [number, number] = [-98.5, 39.8]; // continental US

export interface MapStop extends LatLng {
  id: string;
  order: number;
  label: string;
}

interface MapViewProps {
  origin: LatLng | null;
  destination: LatLng | null;
  stops: MapStop[];
  candidates: CandidateMachine[];
  baseGeometry: [number, number][];
  plannedGeometry: [number, number][];
  /** Bumping this number re-fits the viewport to the current content. */
  fitKey: number;
  onMapClick: (p: LatLng) => void;
  onCandidateClick: (id: string) => void;
}

function lineFeature(coords: [number, number][]): Feature<LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
}

function emptyLine(): Feature<LineString> {
  return lineFeature([]);
}

function dot(color: string, ring = '#fff'): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};border:3px solid ${ring};box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer`;
  return el;
}

function numberedPin(order: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText =
    'display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#2563eb;color:#fff;font:700 12px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)';
  const span = document.createElement('span');
  span.textContent = String(order);
  span.style.cssText = 'transform:rotate(45deg)';
  el.appendChild(span);
  return el;
}

export default function MapView(props: MapViewProps) {
  const {
    origin,
    destination,
    stops,
    candidates,
    baseGeometry,
    plannedGeometry,
    fitKey,
    onMapClick,
    onCandidateClick,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Keep latest callbacks without re-running the init effect.
  const onMapClickRef = useRef(onMapClick);
  const onCandidateClickRef = useRef(onCandidateClick);
  onMapClickRef.current = onMapClick;
  onCandidateClickRef.current = onCandidateClick;

  // Initialize the map exactly once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: FALLBACK_CENTER,
      zoom: 3.4,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // Keep the map sized to its container even when the surrounding panel
    // (e.g. a resizable side panel) changes size.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on('load', () => {
      map.addSource('base', { type: 'geojson', data: emptyLine() });
      map.addLayer({
        id: 'base',
        type: 'line',
        source: 'base',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#94a3b8', 'line-width': 3, 'line-dasharray': [2, 2] },
      });

      map.addSource('planned', { type: 'geojson', data: emptyLine() });
      map.addLayer({
        id: 'planned',
        type: 'line',
        source: 'planned',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 5 },
      });

      map.addSource('candidates', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'candidates',
        type: 'circle',
        source: 'candidates',
        paint: {
          'circle-radius': 5,
          'circle-color': '#a855f7',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.9,
        },
      });

      map.on('click', 'candidates', (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        if (id) {
          onCandidateClickRef.current(id);
          // Prevent the generic click handler from also firing.
          (e as unknown as { _pokeHandled?: boolean })._pokeHandled = true;
        }
      });
      map.on('mouseenter', 'candidates', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'candidates', () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', (e) => {
        if ((e as unknown as { _pokeHandled?: boolean })._pokeHandled) return;
        // Ignore clicks that landed on a candidate (handled above).
        const hits = map.queryRenderedFeatures(e.point, { layers: ['candidates'] });
        if (hits.length > 0) return;
        onMapClickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      loadedRef.current = true;
      map.resize();
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Update route lines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource('base') as maplibregl.GeoJSONSource | undefined)?.setData(
      baseGeometry.length ? lineFeature(baseGeometry) : emptyLine(),
    );
    (map.getSource('planned') as maplibregl.GeoJSONSource | undefined)?.setData(
      plannedGeometry.length ? lineFeature(plannedGeometry) : emptyLine(),
    );
  }, [baseGeometry, plannedGeometry]);

  // Update candidate dots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: candidates.map((c) => ({
        type: 'Feature',
        properties: { id: c.id, name: c.name, retailer: c.retailer },
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      })),
    };
    (map.getSource('candidates') as maplibregl.GeoJSONSource | undefined)?.setData(fc);
  }, [candidates]);

  // Rebuild origin/destination/stop markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const add = (lngLat: [number, number], el: HTMLElement) => {
      const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
      markersRef.current.push(marker);
    };

    if (origin) add([origin.lng, origin.lat], dot('#16a34a'));
    for (const s of stops) add([s.lng, s.lat], numberedPin(s.order));
    if (destination) add([destination.lng, destination.lat], dot('#dc2626'));
  }, [origin, destination, stops]);

  // Fit viewport to content when requested.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || fitKey === 0) return;
    const pts: [number, number][] = [];
    if (plannedGeometry.length) pts.push(...plannedGeometry);
    else if (baseGeometry.length) pts.push(...baseGeometry);
    if (origin) pts.push([origin.lng, origin.lat]);
    if (destination) pts.push([destination.lng, destination.lat]);
    if (pts.length === 0) return;
    const bounds = pts.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(pts[0], pts[0]),
    );
    map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={containerRef} className="map" />;
}
