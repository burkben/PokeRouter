import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Machine } from '../types';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE_PATH = process.env.HARVEST_OUT ?? resolve(HERE, '../../data/machines.json');
const SEED_PATH = process.env.SEED_PATH ?? resolve(HERE, '../../data/seed/machines.json');
const DATA_PATH = existsSync(LIVE_PATH) ? LIVE_PATH : SEED_PATH;
const SCHEMA_PATH = resolve(HERE, 'schema.sql');
const { DATABASE_URL } = process.env;

const UPSERT = `
  INSERT INTO machines
    (id, name, retailer, street, city, state_province, zip_postal_code, country, lat, lng, geom, last_seen)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
     ST_SetSRID(ST_MakePoint($10, $9), 4326)::geography, now())
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    retailer = EXCLUDED.retailer,
    street = EXCLUDED.street,
    city = EXCLUDED.city,
    state_province = EXCLUDED.state_province,
    zip_postal_code = EXCLUDED.zip_postal_code,
    country = EXCLUDED.country,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    geom = EXCLUDED.geom,
    last_seen = now()
`;

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error(
      'DATABASE_URL is not set.\n' +
        'Start Postgres/PostGIS (see docker-compose.yml) and set DATABASE_URL, e.g.\n' +
        '  DATABASE_URL=postgres://pokerouter:pokerouter@localhost:5432/pokerouter npm run load:db',
    );
    process.exit(1);
  }

  const parsed = JSON.parse(await readFile(DATA_PATH, 'utf8')) as { machines: Machine[] };
  const machines = parsed.machines ?? [];
  const schema = await readFile(SCHEMA_PATH, 'utf8');
  console.log(`Loading ${machines.length} machines from ${DATA_PATH}`);

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(schema);
    await client.query('BEGIN');
    for (const m of machines) {
      await client.query(UPSERT, [
        m.id,
        m.name,
        m.retailer,
        m.street,
        m.city,
        m.stateProvince,
        m.zipPostalCode,
        m.country,
        m.lat,
        m.lng,
      ]);
    }
    await client.query('COMMIT');
    console.log(`✓ Loaded/updated ${machines.length} machines into Postgres.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});
