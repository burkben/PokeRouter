# PokeRouter — web planner

React + Vite + MapLibre GL UI for planning a vending-machine road trip. Talks to
the [`backend/`](../backend) REST API. See the [root README](../README.md) for the
big picture.

## Run

```bash
npm install
npm run dev        # Vite on :5173
```

Requires the backend running on :8080 (or set `BACKEND_URL`). The dev server
proxies `/api/*` to it — see `vite.config.ts`. Copy `.env.example` → `.env` to
override `VITE_API_BASE` / `BACKEND_URL`.

```bash
npm run build      # type-check (tsc -b) + production build to dist/
```

## How it works

- **`src/App.tsx`** — orchestrator: origin (geolocation / click), destination
  (search / click), corridor + max-stops sliders, retailer filter, plan + live
  re-route, editable itinerary, trip stats, send-route deep links.
- **`src/components/MapView.tsx`** — MapLibre wrapper: base (dashed) vs planned
  (solid) route lines, corridor candidate layer, origin/destination/stop markers,
  fit-to-bounds, click handling.
- **`src/components/DestinationSearch.tsx`** — debounced Nominatim search box.
- **`src/api/client.ts`** — typed REST client (`/health`, `/retailers`, `/plan`,
  `/route`). `src/types.ts` mirrors the backend contract.
- **`src/lib/`** — `geocode` (OSM Nominatim), `deeplinks` (Google/Apple multi-stop
  URLs), `format` helpers.

Free services, no API keys: map style/tiles from OpenFreeMap, geocoding from OSM
Nominatim (used politely — debounced, US-scoped).

> When the backend has no `ORS_API_KEY`, routing is an offline straight-line stub:
> routes render as straight lines and the UI shows a note. Set a free key on the
> backend for real road routing.
