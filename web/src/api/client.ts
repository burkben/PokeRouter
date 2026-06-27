import type {
  Health,
  LatLng,
  PlanRequest,
  PlanResult,
  RetailerCount,
  RouteResult,
  ShareBody,
  TeslaSendBody,
  TeslaSendResult,
  TeslaStatus,
  TeslaVehicle,
} from '../types';

// Base URL for the backend. In dev this is "/api" (proxied by Vite to the
// backend). In production, set VITE_API_BASE to the deployed backend origin.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      // non-JSON error body; keep the status line
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<Health>('/health'),
  retailers: () => request<{ retailers: RetailerCount[] }>('/retailers'),
  plan: (body: PlanRequest) =>
    request<PlanResult>('/plan', { method: 'POST', body: JSON.stringify(body) }),
  route: (points: LatLng[]) =>
    request<RouteResult>('/route', {
      method: 'POST',
      body: JSON.stringify({ points }),
    }),
  shareGpx: async (body: ShareBody): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/share/gpx`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Could not build GPX (HTTP ${res.status})`);
    return res.blob();
  },
  teslaStatus: () => request<TeslaStatus>('/tesla/status'),
  teslaVehicles: () => request<{ vehicles: TeslaVehicle[] }>('/tesla/vehicles'),
  teslaSend: (body: TeslaSendBody) =>
    request<TeslaSendResult>('/tesla/send', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Opened in a popup; the backend 302-redirects to Tesla (live) or straight
  // back to the app with ?tesla=connected (mock).
  teslaLoginUrl: () => `${API_BASE}/tesla/auth/login`,
};
