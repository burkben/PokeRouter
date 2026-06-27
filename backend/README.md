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
set (free key from https://openrouteservice.org); otherwise it falls back to an
offline straight-line stub that lets the planner run without a key (routes will
not follow roads — a warning is logged).

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

## Tests

```bash
npm test         # node:test — geometry + corridor planner, fully offline
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
    openRouteServiceProvider.ts Road routing via OpenRouteService
    index.ts            selectRoutingProvider() (ORS if keyed, else stub)
  planner/
    types.ts            PlanRequest / PlanResult contract
    corridor.ts         planCorridorRoute(): base route → corridor → insert stops
    corridor.test.ts
  server/
    app.ts              Fastify app + route schemas
    index.ts            Entry point: load store, pick provider, listen
  db/
    schema.sql          PostGIS schema
    load.ts             Upsert machines.json → Postgres
```
