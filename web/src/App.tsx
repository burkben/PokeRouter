import { useEffect, useMemo, useState } from 'react';
import MapView, { type MapStop } from './components/MapView';
import DestinationSearch from './components/DestinationSearch';
import { api } from './api/client';
import { reverseGeocode } from './lib/geocode';
import { googleMapsLink, appleMapsLink } from './lib/deeplinks';
import { formatKm, formatMiles, formatDuration } from './lib/format';
import type { CandidateMachine, Health, LatLng, PlanResult, RetailerCount } from './types';

interface RouteState {
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][];
}

type ClickMode = 'origin' | 'destination' | null;

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [retailers, setRetailers] = useState<RetailerCount[]>([]);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [originLabel, setOriginLabel] = useState<string>('');
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationLabel, setDestinationLabel] = useState<string>('');
  const [clickMode, setClickMode] = useState<ClickMode>(null);

  const [corridorKm, setCorridorKm] = useState(3);
  const [maxStops, setMaxStops] = useState(5);
  const [selectedRetailers, setSelectedRetailers] = useState<Set<string>>(new Set());

  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [itinerary, setItinerary] = useState<MapStop[]>([]);
  const [baseGeometry, setBaseGeometry] = useState<[number, number][]>([]);
  const [baseSummary, setBaseSummary] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const [route, setRoute] = useState<RouteState | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api.retailers().then((r) => setRetailers(r.retailers)).catch(() => setRetailers([]));
  }, []);

  // Candidate machines not already chosen as stops.
  const candidates: CandidateMachine[] = useMemo(() => {
    if (!planResult) return [];
    const chosen = new Set(itinerary.map((s) => s.id));
    return planResult.candidates.filter((c) => !chosen.has(c.id));
  }, [planResult, itinerary]);

  const plannedGeometry = route?.geometry ?? [];

  function handleMapClick(p: LatLng) {
    if (clickMode === 'origin') {
      setOrigin(p);
      setOriginLabel('Dropped pin');
      setClickMode(null);
      void reverseGeocode(p).then((l) => l && setOriginLabel(l));
    } else if (clickMode === 'destination') {
      setDestination(p);
      setDestinationLabel('Dropped pin');
      setClickMode(null);
      void reverseGeocode(p).then((l) => l && setDestinationLabel(l));
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(p);
        setOriginLabel('My location');
        void reverseGeocode(p).then((l) => l && setOriginLabel(l));
      },
      () => setError('Could not get your location. Search for an origin above or use "Set on map" instead.'),
    );
  }

  function toMapStops(result: PlanResult): MapStop[] {
    return result.stops.map((s) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      order: s.order,
      label: `${s.name} · ${s.retailer}`,
    }));
  }

  async function plan() {
    if (!origin || !destination) {
      setError('Set both an origin and a destination first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const req = {
        origin,
        destination,
        maxStops,
        corridorMeters: Math.round(corridorKm * 1000),
        retailers: selectedRetailers.size ? [...selectedRetailers] : undefined,
      };
      const [result, baseRoute] = await Promise.all([
        api.plan(req),
        api.route([origin, destination]),
      ]);
      setPlanResult(result);
      setItinerary(toMapStops(result));
      setBaseGeometry(baseRoute.routeGeometry);
      setBaseSummary({
        distanceMeters: result.base.distanceMeters,
        durationSeconds: result.base.durationSeconds,
      });
      setRoute({
        distanceMeters: result.planned.distanceMeters,
        durationSeconds: result.planned.durationSeconds,
        geometry: result.routeGeometry,
      });
      setFitKey((k) => k + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function reroute(stops: MapStop[]) {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    try {
      const points = [origin, ...stops.map((s) => ({ lat: s.lat, lng: s.lng })), destination];
      const r = await api.route(points);
      setRoute({
        distanceMeters: r.distanceMeters,
        durationSeconds: r.durationSeconds,
        geometry: r.routeGeometry,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function renumber(stops: MapStop[]): MapStop[] {
    return stops.map((s, i) => ({ ...s, order: i + 1 }));
  }

  function removeStop(id: string) {
    const next = renumber(itinerary.filter((s) => s.id !== id));
    setItinerary(next);
    void reroute(next);
  }

  function moveStop(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= itinerary.length) return;
    const next = [...itinerary];
    [next[index], next[target]] = [next[target], next[index]];
    const renumbered = renumber(next);
    setItinerary(renumbered);
    void reroute(renumbered);
  }

  function addCandidate(id: string) {
    if (!planResult) return;
    const c = planResult.candidates.find((m) => m.id === id);
    if (!c || itinerary.some((s) => s.id === id)) return;
    const next = renumber([
      ...itinerary,
      { id: c.id, lat: c.lat, lng: c.lng, order: 0, label: `${c.name} · ${c.retailer}` },
    ]);
    setItinerary(next);
    void reroute(next);
  }

  function toggleRetailer(name: string) {
    setSelectedRetailers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const stopPoints = itinerary.map((s) => ({ lat: s.lat, lng: s.lng }));
  const canSend = origin && destination;
  const addedMeters =
    route && baseSummary ? route.distanceMeters - baseSummary.distanceMeters : 0;
  const addedSeconds =
    route && baseSummary ? route.durationSeconds - baseSummary.durationSeconds : 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <h1>⚡ PokeRouter</h1>
          <p>Plan a drive that hits Pokémon vending machines along the way.</p>
        </header>

        {health && (
          <div className="status">
            {health.machines.toLocaleString()} machines ·{' '}
            {health.routing.isRoadRouting ? 'road routing' : 'straight-line (no ORS key)'}
          </div>
        )}

        <section className="panel">
          <h2>Route</h2>
          <label className="field-label">Origin</label>
          <DestinationSearch
            placeholder="Search origin (address, city, place)…"
            onPick={(r) => {
              setOrigin({ lat: r.lat, lng: r.lng });
              setOriginLabel(r.label);
              setFitKey((k) => k + 1);
            }}
          />
          <div className="row">
            <button type="button" onClick={useMyLocation}>📍 My location</button>
            <button
              type="button"
              className={clickMode === 'origin' ? 'active' : ''}
              onClick={() => setClickMode(clickMode === 'origin' ? null : 'origin')}
            >
              {clickMode === 'origin' ? 'Click map…' : 'Set on map'}
            </button>
          </div>
          {originLabel && <div className="chosen">{originLabel}</div>}

          <label className="field-label">Destination</label>
          <DestinationSearch
            onPick={(r) => {
              setDestination({ lat: r.lat, lng: r.lng });
              setDestinationLabel(r.label);
              setFitKey((k) => k + 1);
            }}
          />
          <div className="row">
            <button
              type="button"
              className={clickMode === 'destination' ? 'active' : ''}
              onClick={() => setClickMode(clickMode === 'destination' ? null : 'destination')}
            >
              {clickMode === 'destination' ? 'Click map…' : 'Set on map'}
            </button>
          </div>
          {destinationLabel && <div className="chosen">{destinationLabel}</div>}
        </section>

        <section className="panel">
          <h2>Detour budget</h2>
          <label className="field-label">
            Corridor width: <strong>{corridorKm.toFixed(1)} km</strong> each side
          </label>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.5}
            value={corridorKm}
            onChange={(e) => setCorridorKm(Number(e.target.value))}
          />
          <label className="field-label">
            Max stops: <strong>{maxStops}</strong>
          </label>
          <input
            type="range"
            min={0}
            max={15}
            step={1}
            value={maxStops}
            onChange={(e) => setMaxStops(Number(e.target.value))}
          />

          {retailers.length > 0 && (
            <details className="retailers">
              <summary>
                Retailers{' '}
                {selectedRetailers.size > 0 ? `(${selectedRetailers.size} selected)` : '(all)'}
              </summary>
              <div className="retailer-list">
                {retailers.map((r) => (
                  <label key={r.retailer} className="retailer-item">
                    <input
                      type="checkbox"
                      checked={selectedRetailers.has(r.retailer)}
                      onChange={() => toggleRetailer(r.retailer)}
                    />
                    <span>{r.retailer}</span>
                    <span className="count">{r.count}</span>
                  </label>
                ))}
              </div>
            </details>
          )}

          <button type="button" className="primary" onClick={plan} disabled={loading || !canSend}>
            {loading ? 'Planning…' : 'Plan route'}
          </button>
        </section>

        {error && <div className="error-banner">{error}</div>}

        {route && baseSummary && (
          <section className="panel">
            <h2>Trip</h2>
            <div className="stats">
              <div>
                <span className="stat-label">Distance</span>
                <span className="stat-value">{formatMiles(route.distanceMeters)}</span>
                <span className="stat-sub">{formatKm(route.distanceMeters)}</span>
              </div>
              <div>
                <span className="stat-label">Time</span>
                <span className="stat-value">{formatDuration(route.durationSeconds)}</span>
              </div>
              <div>
                <span className="stat-label">Added detour</span>
                <span className="stat-value">{formatMiles(Math.max(0, addedMeters))}</span>
                <span className="stat-sub">+{formatDuration(Math.max(0, addedSeconds))}</span>
              </div>
              <div>
                <span className="stat-label">Stops</span>
                <span className="stat-value">{itinerary.length}</span>
              </div>
            </div>
            {!health?.routing.isRoadRouting && (
              <p className="note">
                Distances are straight-line estimates. Add an OpenRouteService key to the backend
                for real road routes.
              </p>
            )}
          </section>
        )}

        {planResult && (
          <section className="panel">
            <h2>Stops ({itinerary.length})</h2>
            {itinerary.length === 0 && (
              <p className="muted">No stops. Click purple dots on the map to add machines.</p>
            )}
            <ol className="stops">
              {itinerary.map((s, i) => (
                <li key={s.id}>
                  <span className="stop-num">{s.order}</span>
                  <span className="stop-label">{s.label}</span>
                  <span className="stop-actions">
                    <button type="button" title="Move up" disabled={i === 0} onClick={() => moveStop(i, -1)}>↑</button>
                    <button type="button" title="Move down" disabled={i === itinerary.length - 1} onClick={() => moveStop(i, 1)}>↓</button>
                    <button type="button" title="Remove" onClick={() => removeStop(s.id)}>✕</button>
                  </span>
                </li>
              ))}
            </ol>
            {candidates.length > 0 && (
              <p className="muted">
                {candidates.length} more machine{candidates.length === 1 ? '' : 's'} in corridor —
                click a purple dot to add.
              </p>
            )}
          </section>
        )}

        {canSend && route && (
          <section className="panel">
            <h2>Send route</h2>
            <div className="row">
              <a
                className="btn-link"
                href={googleMapsLink(origin, stopPoints, destination)}
                target="_blank"
                rel="noreferrer"
              >
                Google Maps
              </a>
              <a
                className="btn-link"
                href={appleMapsLink(origin, stopPoints, destination)}
                target="_blank"
                rel="noreferrer"
              >
                Apple Maps
              </a>
            </div>
            <p className="muted">Tesla send-to-car comes in a later phase.</p>
          </section>
        )}
      </aside>

      <main className="map-wrap">
        {clickMode && (
          <div className="map-hint">
            Click the map to set the <strong>{clickMode}</strong>.
          </div>
        )}
        <MapView
          origin={origin}
          destination={destination}
          stops={itinerary}
          candidates={candidates}
          baseGeometry={baseGeometry}
          plannedGeometry={plannedGeometry}
          fitKey={fitKey}
          onMapClick={handleMapClick}
          onCandidateClick={addCandidate}
        />
      </main>
    </div>
  );
}
