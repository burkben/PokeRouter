import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { LatLng, TeslaSendResult, TeslaStatus, TeslaVehicle } from '../types';

interface NamedStop {
  lat: number;
  lng: number;
  label?: string;
}

interface Props {
  origin: LatLng;
  originLabel: string;
  destination: LatLng;
  destinationLabel: string;
  stops: NamedStop[];
}

/**
 * "Send to car" panel for Tesla. Hidden entirely when the backend reports the
 * integration is disabled. In mock mode (TESLA_MOCK=1) the connect flow is
 * instant; in live mode it opens Tesla's OAuth consent in a popup.
 */
export default function SendToTesla({
  origin,
  originLabel,
  destination,
  destinationLabel,
  stops,
}: Props) {
  const [status, setStatus] = useState<TeslaStatus | null>(null);
  const [vehicles, setVehicles] = useState<TeslaVehicle[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TeslaSendResult | null>(null);
  const [nextIndex, setNextIndex] = useState(0);
  const [sentIndices, setSentIndices] = useState<number[]>([]);
  const pollRef = useRef<number | null>(null);

  // The ordered legs the car will visit: every stop, then the final destination.
  const waypoints = useMemo(
    () => [
      ...stops.map((s, i) => ({
        lat: s.lat,
        lng: s.lng,
        label: s.label ?? `Stop ${i + 1}`,
        isStop: true,
      })),
      {
        lat: destination.lat,
        lng: destination.lng,
        label: destinationLabel || 'Destination',
        isStop: false,
      },
    ],
    [stops, destination, destinationLabel],
  );

  // Reset the stepper whenever the planned route changes.
  const routeSig = useMemo(
    () => JSON.stringify([stops.map((s) => [s.lat, s.lng]), [destination.lat, destination.lng]]),
    [stops, destination],
  );
  useEffect(() => {
    setNextIndex(0);
    setSentIndices([]);
    setResult(null);
  }, [routeSig]);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.teslaStatus();
      setStatus(s);
      return s;
    } catch {
      setStatus({ mode: 'disabled', configured: false, connected: false });
      return null;
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refreshStatus]);

  // Once connected, load the vehicle list and default the selection.
  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    api
      .teslaVehicles()
      .then(({ vehicles: vs }) => {
        if (cancelled) return;
        setVehicles(vs);
        setSelected((cur) => cur || vs[0]?.id || '');
      })
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [status?.connected]);

  function connect() {
    setError(null);
    const popup = window.open(api.teslaLoginUrl(), 'tesla-connect', 'width=520,height=720');
    // Poll for connection; mock connects almost immediately, live after consent.
    let tries = 0;
    pollRef.current = window.setInterval(async () => {
      tries += 1;
      const s = await refreshStatus();
      if (s?.connected || tries > 120) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        if (s?.connected && popup && !popup.closed) popup.close();
      }
    }, 1000);
  }

  async function send(index: number) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.teslaSend({
        vehicleTag: selected,
        origin: { ...origin, name: originLabel || 'Origin' },
        destination: { ...destination, name: destinationLabel || 'Destination' },
        stops: stops.map((s, i) => ({
          lat: s.lat,
          lng: s.lng,
          name: s.label ?? `Stop ${i + 1}`,
        })),
        targetIndex: index,
      });
      setResult(r);
      setSentIndices((prev) => (prev.includes(index) ? prev : [...prev, index]));
      setNextIndex(Math.min(index + 1, waypoints.length - 1));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Disabled (or status not yet known to be enabled) → render nothing.
  if (!status || status.mode === 'disabled') return null;

  return (
    <section className="panel">
      <h2>
        Send to Tesla
        {status.mode === 'mock' && <span className="tag">demo</span>}
      </h2>

      {!status.connected ? (
        <>
          <p className="muted">
            {status.mode === 'mock'
              ? 'Demo mode — connect a simulated Tesla account to preview the flow.'
              : 'Connect your Tesla account to push this route to your car.'}
          </p>
          <button type="button" onClick={connect}>
            🚗 Connect Tesla
          </button>
        </>
      ) : (
        <>
          <label className="field-label">Vehicle</label>
          <select
            className="vehicle-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayName} ({v.state})
              </option>
            ))}
          </select>

          <ol className="tesla-legs">
            {waypoints.map((w, i) => {
              const done = sentIndices.includes(i);
              const isNext = i === nextIndex;
              return (
                <li key={i} className={`leg${isNext ? ' next' : ''}${done ? ' done' : ''}`}>
                  <span className="leg-label">
                    {w.isStop ? '📍' : '🏁'} {w.label}
                    {done && <span className="leg-check"> ✓</span>}
                    {isNext && !done && <span className="leg-tag">next</span>}
                  </span>
                  <button
                    type="button"
                    className="leg-send"
                    onClick={() => send(i)}
                    disabled={busy || !selected}
                  >
                    {done ? 'Resend' : 'Send'}
                  </button>
                </li>
              );
            })}
          </ol>

          <button type="button" onClick={() => send(nextIndex)} disabled={busy || !selected}>
            {busy ? 'Sending…' : `🚗 Send next stop → ${waypoints[nextIndex]?.label ?? ''}`}
          </button>

          {result && (
            <p className="note">
              ✓ Sent{' '}
              {result.isFinal
                ? 'final destination'
                : `stop ${result.targetIndex + 1} of ${result.waypointCount}`}
              {result.targetName ? ` (${result.targetName})` : ''} to{' '}
              <strong>{result.vehicle}</strong>
              {status.mode === 'mock' && ' (demo — nothing left your machine)'}.
            </p>
          )}

          <p className="muted" style={{ marginTop: 8 }}>
            Tesla's API accepts only one destination at a time — intermediate stops
            get dropped — so PokéRouter sends your trip one leg at a time. Tap{' '}
            <strong>Send next stop</strong> as you reach each machine; your phone's
            map still has the full multi-stop route.
          </p>
        </>
      )}

      {error && <p className="note">{error}</p>}
    </section>
  );
}
