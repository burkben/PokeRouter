-- PokeRouter machine catalog (PostGIS).
-- Applied automatically by `npm run load:db`.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS machines (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  retailer         text,
  street           text,
  city             text,
  state_province   text,
  zip_postal_code  text,
  country          text,
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  geom             geography(Point, 4326) NOT NULL,
  first_seen       timestamptz NOT NULL DEFAULT now(),
  last_seen        timestamptz NOT NULL DEFAULT now()
);

-- Spatial index powers corridor queries (ST_DWithin on geography → meters).
CREATE INDEX IF NOT EXISTS machines_geom_idx ON machines USING gist (geom);
CREATE INDEX IF NOT EXISTS machines_state_idx ON machines (state_province);
