# PokeRouter

Plan a multi-stop driving route from your current location to a destination that
passes **Pokémon vending machines** "along the way," review and edit the stops,
then hand the route off to Google/Apple Maps (and, later, a Tesla).

The hard part isn't drawing a map — it's **"POIs along a corridor with minimal
added detour"** plus the **delivery integrations**. PokeRouter is a free,
all-TypeScript take on that, modelled on how EV trip planners (e.g. ABRP) insert
charging stops along a route.

## Status

| Phase | What | State |
| ----- | ---- | ----- |
| P0 | Data harvester → `backend/data/machines.json` (1,863 machines, 28 states) | ✅ |
| P1 | Corridor routing core (Fastify API, in-memory catalog, pluggable routing) | ✅ |
| P2 | Web planner UI (map, destination search, detour slider, editable stops, deep links) | ✅ |
| P3 | Universal delivery — Google/Apple multi-stop deep links | ▶ basic builder shipped in P2 |
| P4 | Tesla Fleet API "send to car" | ☐ |
| P5 | iOS + CarPlay | ☐ |

See [`backend/README.md`](backend/README.md) for the data + API details, and the
session plan for the full architecture and locked decisions.

## Repo layout

```
backend/   Node + TypeScript (ESM). Harvester, in-memory catalog, routing
           providers, corridor planner, Fastify API. See backend/README.md.
web/       React + Vite + MapLibre planner UI. Talks to the backend over REST.
```

## Quick start (two terminals)

**1. Backend** (port 8080):

```bash
cd backend
npm install
npm run harvest      # first run only: writes data/machines.json
npm run dev          # Fastify on :8080 (tsx watch)
```

Routing follows real roads when `ORS_API_KEY` is set (free key from
https://openrouteservice.org). Without a key it falls back to an offline
straight-line stub, so the planner still runs — routes just won't follow roads,
and the web app shows a note when this stub is active.

**2. Web** (port 5173):

```bash
cd web
npm install
npm run dev          # Vite on :5173
```

The Vite dev server proxies `/api/*` → the backend (`http://localhost:8080` by
default; override with `BACKEND_URL`). Open http://localhost:5173.

### Using it

1. Allow geolocation (or click the map) to set your **origin**.
2. Search for a **destination** (or click the map).
3. Tune the **corridor width** and **max stops**, optionally filter by retailer.
4. **Plan** — vending machines within the corridor are inserted as ordered stops.
5. Add / remove / reorder stops; trip stats update live.
6. **Send route** opens a Google or Apple Maps multi-stop deep link.

## Tech

- **Backend:** Node + Fastify, TypeScript (ESM, tsx). In-memory `MachineStore`
  (no DB required to run); optional PostGIS loader. Pluggable `RoutingProvider`
  (OpenRouteService or offline stub).
- **Web:** React 19 + Vite + MapLibre GL. Free map style/tiles from OpenFreeMap;
  forward/reverse geocoding from OpenStreetMap Nominatim. No API keys, no billing.

## Data & legal

Machine locations come from the public Pokémon vending locator (via a community
bulk mirror by default; the official API behind an adaptive quadtree as a
fallback). We harvest politely to a cached snapshot and never hit the source at
request time. Data is factual location info; community sources are attributed.
