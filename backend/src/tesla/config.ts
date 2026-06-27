import { readFileSync } from 'node:fs';
import type { TeslaMode } from './types';

/**
 * Tesla Fleet API configuration, resolved from the environment.
 *
 * Three modes:
 *  - "mock"     — TESLA_MOCK is truthy. A fake, fully demoable flow with canned
 *                 vehicles; no Tesla account, no network. Great for the UX.
 *  - "live"     — client id/secret/redirect are all set. Real OAuth + Fleet API.
 *  - "disabled" — nothing configured. The Tesla panel is hidden in the UI and
 *                 the endpoints report `disabled`.
 */
export interface TeslaConfig {
  mode: TeslaMode;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  /** Region-specific Fleet API base, e.g. https://fleet-api.prd.na.vn.cloud.tesla.com */
  audience: string;
  /** OAuth base, default https://auth.tesla.com */
  authBaseUrl: string;
  scopes: string;
  /** Where to send the browser back after the OAuth dance completes. */
  webReturnUrl: string;
  /** Public key PEM contents (for the .well-known domain-registration file). */
  publicKeyPem?: string;
}

const DEFAULT_AUDIENCE = 'https://fleet-api.prd.na.vn.cloud.tesla.com';
const DEFAULT_AUTH_BASE = 'https://auth.tesla.com';
const DEFAULT_SCOPES =
  'openid offline_access vehicle_device_data vehicle_cmds vehicle_location';
const DEFAULT_WEB_RETURN = 'http://localhost:5173';

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function readPemFromEnv(): string | undefined {
  const inline = process.env.TESLA_PUBLIC_KEY_PEM;
  if (inline && inline.includes('BEGIN')) return inline;
  const path = process.env.TESLA_PUBLIC_KEY_PEM_PATH;
  if (path) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      console.warn(`[tesla] Could not read TESLA_PUBLIC_KEY_PEM_PATH (${path}).`);
    }
  }
  return undefined;
}

export function loadTeslaConfig(env: NodeJS.ProcessEnv = process.env): TeslaConfig {
  const audience = env.TESLA_AUDIENCE ?? DEFAULT_AUDIENCE;
  const authBaseUrl = env.TESLA_AUTH_URL ?? DEFAULT_AUTH_BASE;
  const scopes = env.TESLA_SCOPES ?? DEFAULT_SCOPES;
  const webReturnUrl = env.TESLA_WEB_RETURN_URL ?? DEFAULT_WEB_RETURN;
  const publicKeyPem = readPemFromEnv();

  const base = { audience, authBaseUrl, scopes, webReturnUrl, publicKeyPem };

  if (truthy(env.TESLA_MOCK)) {
    return { mode: 'mock', ...base };
  }

  const clientId = env.TESLA_CLIENT_ID;
  const clientSecret = env.TESLA_CLIENT_SECRET;
  const redirectUri = env.TESLA_REDIRECT_URI;
  if (clientId && clientSecret && redirectUri) {
    return { mode: 'live', clientId, clientSecret, redirectUri, ...base };
  }

  return { mode: 'disabled', ...base };
}
