import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTeslaConfig } from './config';

const base: NodeJS.ProcessEnv = {};

test('mock mode wins when TESLA_MOCK is truthy', () => {
  const cfg = loadTeslaConfig({ ...base, TESLA_MOCK: '1' });
  assert.equal(cfg.mode, 'mock');
});

test('live mode requires client id, secret, and redirect together', () => {
  const cfg = loadTeslaConfig({
    ...base,
    TESLA_CLIENT_ID: 'abc',
    TESLA_CLIENT_SECRET: 'shh',
    TESLA_REDIRECT_URI: 'http://localhost:8080/tesla/auth/callback',
  });
  assert.equal(cfg.mode, 'live');
  assert.equal(cfg.clientId, 'abc');
});

test('partial live credentials fall back to disabled', () => {
  const cfg = loadTeslaConfig({ ...base, TESLA_CLIENT_ID: 'abc' });
  assert.equal(cfg.mode, 'disabled');
});

test('nothing configured is disabled with sane defaults', () => {
  const cfg = loadTeslaConfig({ ...base });
  assert.equal(cfg.mode, 'disabled');
  assert.equal(cfg.audience, 'https://fleet-api.prd.na.vn.cloud.tesla.com');
  assert.equal(cfg.authBaseUrl, 'https://auth.tesla.com');
  assert.equal(cfg.webReturnUrl, 'http://localhost:5173');
  assert.match(cfg.scopes, /vehicle_cmds/);
});

test('mock takes precedence even when live creds are present', () => {
  const cfg = loadTeslaConfig({
    ...base,
    TESLA_MOCK: 'true',
    TESLA_CLIENT_ID: 'abc',
    TESLA_CLIENT_SECRET: 'shh',
    TESLA_REDIRECT_URI: 'http://localhost/cb',
  });
  assert.equal(cfg.mode, 'mock');
});
