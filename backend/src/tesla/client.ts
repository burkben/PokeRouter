import type { TeslaConfig } from './config';
import { buildAuthorizeUrl, exchangeCodeForTokens, refreshTokens } from './oauth';
import { navUrlFor } from './nav';
import type { TokenStore } from './store';
import type {
  NavTarget,
  SendResult,
  TeslaProvider,
  TeslaStatus,
  TeslaVehicle,
} from './types';

interface FleetVehicle {
  id: number | string;
  vehicle_id?: number;
  vin: string;
  display_name: string;
  state: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Real Tesla Fleet API client. Handles OAuth token exchange/refresh and the two
 * calls the planner needs: list vehicles and push a navigation destination.
 *
 * IMPORTANT (honest caveat): newer vehicles require *signed* vehicle commands
 * routed through Tesla's vehicle-command HTTP proxy. This MVP sends the command
 * directly, which works for older/unsigned-capable vehicles and for accounts
 * using the proxy as `TESLA_AUDIENCE`, but may return an "unsigned command"
 * error otherwise. Running the proxy is a deployment concern, documented in the
 * README; the env-gated design lets the rest of the app ship without it.
 */
export class LiveTeslaProvider implements TeslaProvider {
  readonly mode = 'live' as const;

  constructor(
    private readonly config: TeslaConfig,
    private readonly store: TokenStore,
  ) {}

  async status(): Promise<TeslaStatus> {
    return { mode: 'live', configured: true, connected: this.isConnected() };
  }

  authorizeUrl(state: string): string {
    return buildAuthorizeUrl(this.config, state);
  }

  async handleCallback(code: string): Promise<void> {
    const tokens = await exchangeCodeForTokens(this.config, code);
    this.store.set(tokens);
  }

  isConnected(): boolean {
    return this.store.get() !== null;
  }

  async listVehicles(): Promise<TeslaVehicle[]> {
    const res = await this.fleetFetch('/api/1/vehicles');
    const json = (await res.json()) as { response: FleetVehicle[] };
    return (json.response ?? []).map((v) => ({
      id: String(v.id),
      vin: v.vin,
      displayName: v.display_name,
      state: v.state,
    }));
  }

  async sendNavigation(vehicleTag: string, target: NavTarget): Promise<SendResult> {
    const url = navUrlFor(target);
    const body = {
      type: 'share_ext_content_raw',
      value: { 'android.intent.extra.TEXT': url },
      locale: 'en-US',
      timestamp_ms: Date.now(),
    };

    let res = await this.command(vehicleTag, 'navigation_request', body);
    // A sleeping vehicle returns 408; wake it once and retry.
    if (res.status === 408) {
      await this.command(vehicleTag, 'wake_up', undefined, 'POST', '/api/1/vehicles');
      await sleep(2500);
      res = await this.command(vehicleTag, 'navigation_request', body);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Tesla navigation_request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return { sent: true, url, vehicle: vehicleTag };
  }

  private command(
    tag: string,
    command: string,
    body: unknown,
    method = 'POST',
    base = '/api/1/vehicles',
  ): Promise<Response> {
    const path =
      command === 'wake_up'
        ? `${base}/${encodeURIComponent(tag)}/wake_up`
        : `${base}/${encodeURIComponent(tag)}/command/${command}`;
    return this.fleetFetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private async fleetFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(`${this.config.audience}${path}`, { ...init, headers });
  }

  /** Return a valid access token, refreshing it if it has expired. */
  private async accessToken(): Promise<string> {
    const current = this.store.get();
    if (!current) throw new Error('Not connected to Tesla.');
    if (Date.now() < current.expiresAt) return current.accessToken;

    const refreshed = await refreshTokens(this.config, current.refreshToken);
    this.store.set(refreshed);
    return refreshed.accessToken;
  }
}
