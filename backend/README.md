# PokeRouter Backend

Vending-machine data harvester and (later) the corridor routing API.

## Requirements

- Node.js >= 20 (uses the built-in global `fetch`)
- Postgres + PostGIS — **optional**, only for loading into a database

## Setup

```bash
cd backend
npm install
```

## P0 — Harvest the vending machine dataset

```bash
npm run harvest            # default: bulk source (one request)
npm run harvest -- --source=api   # official API adaptive quadtree sweep
npm run harvest -- --source=seed  # offline: rebuild from the committed snapshot
```

This writes `data/machines.json` (git-ignored). Three interchangeable sources sit
behind one interface:

- **`bulk`** (default) — fetches the entire catalog in a single request from the
  community mirror (`https://pkmnvm.com/api/locations`). Same Airtable record ids
  and schema as the official locator, but with no WAF. Polite and fast.
- **`api`** — adaptive **quadtree** sweep of the official locator API
  (`https://api.vending.prod.pokemon.com/v1/machines`). That endpoint caps each
  bounding-box query at 20 results sorted by distance from the box center, so any
  box returning 20 is split into four quadrants and re-queried until every leaf
  returns fewer than 20. Results are de-duplicated by machine `id`. The official
  endpoint is behind an Imperva/Incapsula WAF that rate-limits sustained
  automated traffic, so this path runs slowly on purpose and is best used as a
  canonical fallback / verification source.
- **`seed`** — reads the committed dataset snapshot at `data/seed/machines.json`.
  Zero network requests; the offline / resilience fallback if both remote sources
  are unreachable. The DB loader also falls back to this snapshot automatically
  when no live `data/machines.json` exists.

Tuning is via environment variables (see `.env.example`).

## Load into PostGIS (optional, for P1)

```bash
docker compose up -d
DATABASE_URL=postgres://pokerouter:pokerouter@localhost:5432/pokerouter npm run load:db
```

Creates the `machines` table (with a GiST spatial index) and upserts the
harvested records, tracking `first_seen` / `last_seen` for refresh runs.

## P1 — Corridor routing API

Run the API server (no database required — it loads the harvested snapshot, or
the committed seed, into memory):

```bash
npm run dev      # tsx watch, reloads on change
npm start        # one-off run
```

Listens on `PORT` (default `8080`). Routing follows roads when `ORS_API_KEY` is
set (free key from https://openrouteservice.org — put it in `backend/.env`,
which is git-ignored and auto-loaded at startup); otherwise it falls back to an
offline straight-line stub that lets the planner run without a key (routes will
not follow roads — a warning is logged).

The key is validated once at startup, so `/health` only reports `isRoadRouting:
true` when the key actually works (a rejected key logs a clear error and reverts
to the stub). Once validated, a transient ORS failure (rate limit, quota, or
network) degrades that single request to the straight-line stub instead of
failing the whole request.

### Endpoints

- `GET /health` → `{ status, machines, routing: { provider, isRoadRouting } }`.
- `GET /machines/near?lat=&lng=&radiusMeters=&limit=` → machines near a point,
  nearest first.
- `GET /retailers` → `{ retailers: [{ retailer, count }] }`, most common first
  (drives the web app's retailer filter).
- `POST /plan` → corridor plan. Body:

  ```jsonc
  {
    "origin":      { "lat": 47.6062, "lng": -122.3321 },
    "destination": { "lat": 45.5152, "lng": -122.6784 },
    "maxStops": 5,                  // optional, default 5
    "corridorMeters": 3000,         // optional, max off-route distance, default 3000
    "maxAddedMetersPerStop": 12000, // optional, default corridorMeters * 4
    "retailers": ["Safeway", "Kroger"] // optional, restrict to these retailers
  }
  ```

  Returns the base vs. planned distance/time, the ordered vending-machine stops
  with their off-route distance and added detour, the candidate count, the
  corridor `candidates` (capped, nearest-route first, for selection in the UI),
  and the final route geometry as `[lng, lat]` tuples.

- `POST /route` → route through explicit waypoints (used by the web app when the
  user manually adds/removes/reorders stops). Body: `{ "points": [{lat,lng}, …] }`
  (≥ 2 points). Returns `{ distanceMeters, durationSeconds, routeGeometry, routing }`.

### Example

```bash
curl -s localhost:8080/health
curl -s -X POST localhost:8080/plan -H 'content-type: application/json' \
  -d '{"origin":{"lat":47.6062,"lng":-122.3321},"destination":{"lat":45.5152,"lng":-122.6784}}'
```

## P4 — Send the route to a Tesla

The planned route can be pushed straight to a parked Tesla's nav via the Tesla
Fleet API. The integration is **env-gated** and resolves to one of three modes,
exactly mirroring the ORS pattern:

| Mode | How to enable | What happens |
| --- | --- | --- |
| **disabled** (default) | nothing set | Tesla panel hidden in the web UI; endpoints report `disabled`. |
| **mock** | `TESLA_MOCK=1` | Fully offline demo — two canned vehicles, instant connect, nothing leaves your machine. |
| **live** | `TESLA_CLIENT_ID` + `TESLA_CLIENT_SECRET` + `TESLA_REDIRECT_URI` (all three) | Real Fleet API: OAuth, list vehicles, send navigation. |

`TESLA_MOCK` wins even if live credentials are also present, so you can always
fall back to the demo.

### Try the demo (no Tesla account)

```bash
TESLA_MOCK=1 npm start
curl -s localhost:8080/tesla/status
curl -s localhost:8080/tesla/auth/login -i | grep -i location   # auto-connects the mock
curl -s localhost:8080/tesla/vehicles
curl -s -X POST localhost:8080/tesla/send -H 'content-type: application/json' \
  -d '{"vehicleTag":"100021","destination":{"lat":45.5152,"lng":-122.6784,"name":"Home"},
       "origin":{"lat":47.6062,"lng":-122.3321},"stops":[{"lat":47.5,"lng":-122.4,"name":"Q00562"}],
       "targetIndex":0}'
```

`/tesla/send` returns a **single-destination** Google Maps search link for one leg
of the trip plus `{ targetIndex, targetName, waypointCount, isFinal }` describing
which waypoint was sent.

> **Why one leg at a time?** Tesla's `navigation_request` parses only a *single*
> destination out of a shared link — intermediate waypoints are silently dropped,
> so a full multi-stop link would route the car straight home past every machine.
> Instead the client walks `[...stops, destination]` and sends one waypoint per
> `POST /tesla/send` (`targetIndex` defaults to `0` = the next vending machine).
> Phone handoff (Apple/Google Maps) still gets the whole multi-stop route.

### Endpoints

- `GET /tesla/status` → `{ mode, configured, connected, vehicleCount? }`.
- `GET /tesla/auth/login` → 302 to Tesla's OAuth consent (mock auto-connects).
- `GET /tesla/auth/callback` → OAuth redirect target; stores tokens, bounces back
  to `TESLA_WEB_RETURN_URL?tesla=connected`.
- `GET /tesla/vehicles` → `{ vehicles: [{ id, displayName, state, vin? }] }`.
- `POST /tesla/send` → `{ vehicleTag, destination, origin?, stops?, targetIndex? }`
  → sends one waypoint (single-destination link) to the car; returns
  `{ sent, url, vehicle, targetIndex, targetName?, waypointCount, isFinal }`.
- `GET /.well-known/appspecific/com.tesla.3p.public-key.pem` → serves your Fleet
  API public key for domain registration (404 until you configure one).

### Real Fleet API setup

1. Register a Tesla developer app at <https://developer.tesla.com>; note the
   client ID/secret and set your redirect URI to `TESLA_REDIRECT_URI`.
2. Generate an EC key pair and point `TESLA_PUBLIC_KEY_PEM_PATH` (or inline
   `TESLA_PUBLIC_KEY_PEM`) at the public key. Host the backend on your verified
   domain so Tesla can fetch it at the `.well-known` path above.
3. Set `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_REDIRECT_URI`, and (if
   outside North America) `TESLA_AUDIENCE`. Restart, then connect from the web UI.

> **Heads-up — signed commands.** Newer Tesla vehicles reject *unsigned*
> commands; `navigation_request` must be relayed through Tesla's
> [vehicle-command HTTP proxy](https://github.com/teslamotors/vehicle-command),
> with `TESLA_AUDIENCE` pointing at that proxy. This backend issues the command
> directly, so a live send may fail with an "unsigned command" error on those
> cars until the proxy is in place. The mock mode sidesteps all of this.

## Tests

```bash
npm test         # node:test — geometry + corridor planner + Tesla, fully offline
npm run typecheck
```

## Layout

```
src/
  types.ts              Shared types (Bbox, Machine, SweepResult)
  harvester/
    grid.ts             Quadtree split + seed regions
    vendingClient.ts    Official API client (browser headers, retries, backoff)
    harvest.ts          Orchestrator: selects a source → data/machines.json
    sources/
      bulk.ts           Bulk community mirror (default, one request)
      apiSweep.ts       Adaptive quadtree sweep of the official API
      seed.ts           Committed snapshot reader (offline fallback)
  geo/
    geo.ts              Spatial math on [lng, lat] tuples (haversine, corridors)
    geo.test.ts
  catalog/
    machineStore.ts     In-memory catalog: near() + withinCorridor()
  routing/
    types.ts            RoutingProvider interface + RouteResult
    haversineProvider.ts        Offline straight-line stub
    openRouteServiceProvider.ts Road routing via OpenRouteService (+ key validate())
    fallbackProvider.ts         Wraps ORS → stub on per-request failure
    index.ts            selectRoutingProvider() (validates ORS key, else stub)
  planner/
    types.ts            PlanRequest / PlanResult contract
    corridor.ts         planCorridorRoute(): base route → corridor → insert stops
    corridor.test.ts
  tesla/
    types.ts            TeslaProvider interface + NavTarget/TeslaVehicle/etc.
    config.ts           loadTeslaConfig(): mock | live | disabled
    config.test.ts
    store.ts            Token store (in-memory + optional file persist)
    oauth.ts            Authorize URL + code/refresh token exchange
    oauth.test.ts
    nav.ts              navUrlFor(): route → Google Maps deep link for the car
    mock.ts             MockTeslaProvider (offline demo)
    mock.test.ts
    client.ts           LiveTeslaProvider (real Fleet API, wake-on-408 retry)
    index.ts            selectTeslaProvider(config)
    routes.ts           registerTeslaRoutes(): /tesla/* endpoints
  server/
    app.ts              Fastify app + route schemas
    index.ts            Entry point: load store, pick provider, listen
  db/
    schema.sql          PostGIS schema
    load.ts             Upsert machines.json → Postgres
```
