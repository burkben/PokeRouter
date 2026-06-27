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
  db/
    schema.sql          PostGIS schema
    load.ts             Upsert machines.json → Postgres
```
