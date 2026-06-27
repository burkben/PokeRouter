import type { NamedPoint } from '../share/links';

export type TeslaMode = 'mock' | 'live' | 'disabled';

/** A vehicle as surfaced to clients (a trimmed view of the Fleet API shape). */
export interface TeslaVehicle {
  /** Command tag used in Fleet API command paths (vehicle id). */
  id: string;
  vin: string;
  displayName: string;
  /** 'online' | 'asleep' | 'offline' (best-effort; mock always 'online'). */
  state: string;
}

/** Where to send the car. Origin/stops are optional; only destination is required. */
export interface NavTarget {
  origin?: NamedPoint;
  destination: NamedPoint;
  stops?: NamedPoint[];
}

export interface TeslaStatus {
  mode: TeslaMode;
  /** Credentials present (live) or mock explicitly enabled. */
  configured: boolean;
  /** A usable user token is held, so vehicle calls can be made. */
  connected: boolean;
  vehicleCount?: number;
}

export interface SendResult {
  sent: true;
  /** The Google Maps URL handed to the vehicle's navigation. */
  url: string;
  vehicle: string;
}

/**
 * One interface, two implementations: a MockTeslaProvider (demoable with
 * TESLA_MOCK=1, no Tesla account needed) and a LiveTeslaProvider (real Fleet
 * API). The HTTP routes are identical for both.
 */
export interface TeslaProvider {
  readonly mode: 'mock' | 'live';
  status(): Promise<TeslaStatus>;
  /** OAuth authorize URL for the connect flow; null in mock (no real OAuth). */
  authorizeUrl(state: string): string | null;
  /** Exchange an OAuth callback for tokens (mock: just flips to connected). */
  handleCallback(code: string, state: string): Promise<void>;
  isConnected(): boolean;
  listVehicles(): Promise<TeslaVehicle[]>;
  sendNavigation(vehicleTag: string, target: NavTarget): Promise<SendResult>;
}
