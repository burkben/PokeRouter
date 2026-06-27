/** A geographic bounding box, matching the vending API's query parameters. */
export interface Bbox {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

/** A Pokémon vending machine, normalized for storage. */
export interface Machine {
  /** Stable record id from the source API (e.g. "recxjGlZEZ2DArT6q"). */
  id: string;
  /** Machine code shown in-store (e.g. "Q00562"). */
  name: string;
  retailer: string;
  street: string;
  city: string;
  stateProvince: string;
  zipPostalCode: string;
  country: string;
  lat: number;
  lng: number;
}

/** Raw machine record as returned by the API (includes query-relative distance). */
export interface ApiMachine extends Machine {
  /** Distance in miles from the query box center — not persisted (query-relative). */
  distance: number;
}

/** Result of running a machine source: the records plus run statistics. */
export interface SweepResult {
  machines: Machine[];
  /** Number of HTTP requests the source made. */
  requestCount: number;
  /** Number of tiles/requests that failed irrecoverably (0 for single-shot sources). */
  failedTiles: number;
  /** Human-readable origin of the data, recorded in the snapshot. */
  source: string;
}
