import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorizeUrl } from './oauth';
import { loadTeslaConfig } from './config';

const liveConfig = loadTeslaConfig({
  TESLA_CLIENT_ID: 'client-123',
  TESLA_CLIENT_SECRET: 'secret',
  TESLA_REDIRECT_URI: 'http://localhost:8080/tesla/auth/callback',
});

test('buildAuthorizeUrl includes the OAuth params Tesla expects', () => {
  const url = new URL(buildAuthorizeUrl(liveConfig, 'state-xyz'));
  assert.equal(url.origin + url.pathname, 'https://auth.tesla.com/oauth2/v3/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'client-123');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'http://localhost:8080/tesla/auth/callback',
  );
  assert.equal(url.searchParams.get('state'), 'state-xyz');
  assert.match(url.searchParams.get('scope') ?? '', /openid/);
});
