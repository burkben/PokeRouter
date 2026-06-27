import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockTeslaProvider } from './mock';

test('mock starts disconnected and connects via handleCallback', async () => {
  const tesla = new MockTeslaProvider();
  assert.equal(tesla.isConnected(), false);
  assert.equal(tesla.authorizeUrl(), null);

  await tesla.handleCallback();
  assert.equal(tesla.isConnected(), true);

  const status = await tesla.status();
  assert.equal(status.mode, 'mock');
  assert.equal(status.connected, true);
});

test('listVehicles throws until connected, then returns canned vehicles', async () => {
  const tesla = new MockTeslaProvider();
  await assert.rejects(() => tesla.listVehicles());

  await tesla.handleCallback();
  const vehicles = await tesla.listVehicles();
  assert.ok(vehicles.length >= 1);
  assert.ok(vehicles[0].id);
  assert.ok(vehicles[0].displayName);
});

test('sendNavigation builds a multi-stop Google Maps URL and records it', async () => {
  const tesla = new MockTeslaProvider();
  await tesla.handleCallback();
  const [vehicle] = await tesla.listVehicles();

  const result = await tesla.sendNavigation(vehicle.id, {
    origin: { lat: 47.6062, lng: -122.3321 },
    stops: [{ lat: 47.5, lng: -122.4, name: 'Q00562' }],
    destination: { lat: 45.5152, lng: -122.6784, name: 'Home' },
  });

  assert.equal(result.sent, true);
  assert.equal(result.vehicle, vehicle.displayName);
  const url = new URL(result.url);
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(url.searchParams.get('waypoints'), '47.5,-122.4');
  assert.equal(tesla.lastSent?.url, result.url);
});

test('sendNavigation without an origin produces a search URL', async () => {
  const tesla = new MockTeslaProvider();
  await tesla.handleCallback();
  const [vehicle] = await tesla.listVehicles();

  const result = await tesla.sendNavigation(vehicle.id, {
    destination: { lat: 45.5152, lng: -122.6784 },
  });
  assert.match(result.url, /\/maps\/search\//);
});

test('sendNavigation rejects an unknown vehicle', async () => {
  const tesla = new MockTeslaProvider();
  await tesla.handleCallback();
  await assert.rejects(() =>
    tesla.sendNavigation('does-not-exist', { destination: { lat: 1, lng: 2 } }),
  );
});
