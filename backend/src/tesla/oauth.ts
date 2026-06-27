import type { TeslaConfig } from './config';
import type { TeslaTokens } from './store';

/**
 * Build the Tesla OAuth 2.0 authorize URL the user's browser is redirected to.
 * `state` is an opaque anti-CSRF value we generate and verify on callback.
 * https://developer.tesla.com/docs/fleet-api/authentication/overview
 */
export function buildAuthorizeUrl(config: TeslaConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId ?? '',
    redirect_uri: config.redirectUri ?? '',
    scope: config.scopes,
    state,
  });
  return `${config.authBaseUrl}/oauth2/v3/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function toTokens(res: TokenResponse): TeslaTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    // Refresh a minute early to avoid races on the expiry boundary.
    expiresAt: Date.now() + (res.expires_in - 60) * 1000,
  };
}

async function postToken(
  config: TeslaConfig,
  body: Record<string, string>,
): Promise<TeslaTokens> {
  const res = await fetch(`${config.authBaseUrl}/oauth2/v3/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Tesla token request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as TokenResponse;
  return toTokens(json);
}

/** Exchange an authorization code for access + refresh tokens. */
export function exchangeCodeForTokens(
  config: TeslaConfig,
  code: string,
): Promise<TeslaTokens> {
  return postToken(config, {
    grant_type: 'authorization_code',
    client_id: config.clientId ?? '',
    client_secret: config.clientSecret ?? '',
    code,
    redirect_uri: config.redirectUri ?? '',
    audience: config.audience,
  });
}

/** Use the refresh token to mint a fresh access token. */
export function refreshTokens(
  config: TeslaConfig,
  refreshToken: string,
): Promise<TeslaTokens> {
  return postToken(config, {
    grant_type: 'refresh_token',
    client_id: config.clientId ?? '',
    refresh_token: refreshToken,
  });
}
