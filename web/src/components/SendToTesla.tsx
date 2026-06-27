import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { LatLng, TeslaStatus, TeslaVehicle } from '../types';

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
  const [sent, setSent] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

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

  async function send() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const result = await api.teslaSend({
        vehicleTag: selected,
        origin: { ...origin, name: originLabel || 'Origin' },
        destination: { ...destination, name: destinationLabel || 'Destination' },
        stops: stops.map((s, i) => ({
          lat: s.lat,
          lng: s.lng,
          name: s.label ?? `Stop ${i + 1}`,
        })),
      });
      setSent(result.vehicle);
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

          <button type="button" onClick={send} disabled={busy || !selected}>
            {busy ? 'Sending…' : '🚗 Send route to car'}
          </button>

          {sent && (
            <p className="note">
              ✓ Sent to <strong>{sent}</strong>
              {status.mode === 'mock' && ' (demo — nothing left your machine)'}.
            </p>
          )}

          <p className="muted" style={{ marginTop: 8 }}>
            Tesla navigation takes a single shared link, so the car routes to your
            destination through the stops via Google Maps.
          </p>
        </>
      )}

      {error && <p className="note">{error}</p>}
    </section>
  );
}
