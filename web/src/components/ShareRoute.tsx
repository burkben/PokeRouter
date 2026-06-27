import { useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import {
  appleMapsLink,
  exceedsWaypointLimit,
  googleMapsLink,
  MAX_MAP_WAYPOINTS,
  wazeLink,
} from '../lib/deeplinks';
import type { LatLng } from '../types';

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
  isRoadRouting: boolean;
}

export default function ShareRoute({
  origin,
  originLabel,
  destination,
  destinationLabel,
  stops,
  isRoadRouting,
}: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopPoints = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  const googleUrl = googleMapsLink(origin, stopPoints, destination);
  const appleUrl = appleMapsLink(origin, stopPoints, destination);
  const wazeUrl = wazeLink(destination);
  const tooMany = exceedsWaypointLimit(stops.length);

  async function toggleQr() {
    if (qr) {
      setQr(null);
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(googleUrl, { width: 220, margin: 1 });
      setQr(dataUrl);
    } catch {
      setError('Could not generate the QR code.');
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(googleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard is blocked — copy the Google Maps link manually.');
    }
  }

  async function downloadGpx() {
    setBusy(true);
    setError(null);
    try {
      const blob = await api.shareGpx({
        origin: { ...origin, name: originLabel || 'Origin' },
        destination: { ...destination, name: destinationLabel || 'Destination' },
        stops: stops.map((s, i) => ({ lat: s.lat, lng: s.lng, name: s.label ?? `Stop ${i + 1}` })),
        name: `PokeRouter: ${originLabel || 'Origin'} → ${destinationLabel || 'Destination'}`,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pokerouter.gpx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Send route</h2>

      <div className="row">
        <a className="btn-link" href={googleUrl} target="_blank" rel="noreferrer">
          Google Maps
        </a>
        <a className="btn-link" href={appleUrl} target="_blank" rel="noreferrer">
          Apple Maps
        </a>
        <a className="btn-link" href={wazeUrl} target="_blank" rel="noreferrer">
          Waze
        </a>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" onClick={copyLink}>
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={toggleQr}>
          {qr ? 'Hide QR' : '📱 Phone QR'}
        </button>
        <button type="button" onClick={downloadGpx} disabled={busy}>
          {busy ? 'Building…' : '⬇ GPX'}
        </button>
      </div>

      {qr && (
        <div className="qr">
          <img src={qr} alt="QR code linking to the route in Google Maps" />
          <span className="muted">Scan with your phone to open the route in Maps.</span>
        </div>
      )}

      {tooMany && (
        <p className="note">
          Google &amp; Apple Maps carry up to {MAX_MAP_WAYPOINTS} stops — this route has{' '}
          {stops.length}, so some may be dropped. Download the GPX for the full itinerary.
        </p>
      )}

      {!isRoadRouting && (
        <p className="note">
          Distances are straight-line estimates (no ORS key). Map apps will still route on roads.
        </p>
      )}

      {error && <p className="note">{error}</p>}

      <p className="muted" style={{ marginTop: 8 }}>
        Waze is single-stop and opens at the destination.
      </p>
    </section>
  );
}
