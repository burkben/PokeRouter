import type { Machine, SweepResult } from '../../types';

/**
 * Bulk community mirror (pkmnvm.com). Serves the entire machine catalog in a
 * single JSON response using the same Airtable record ids and schema as the
 * official locator API — but without the Imperva/Incapsula WAF that rate-limits
 * the official endpoint. This is the default, polite source: one request for
 * the whole dataset.
 */
const BULK_URL = process.env.BULK_API_URL ?? 'https://pkmnvm.com/api/locations';

const HEADERS: Record<string, string> = {
  accept: 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

function isValid(m: Partial<Machine>): m is Machine {
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.lat === 'number' &&
    Number.isFinite(m.lat) &&
    typeof m.lng === 'number' &&
    Number.isFinite(m.lng)
  );
}

function normalize(m: Machine): Machine {
  return {
    id: m.id,
    name: m.name,
    retailer: m.retailer ?? '',
    street: m.street ?? '',
    city: m.city ?? '',
    stateProvince: m.stateProvince ?? '',
    zipPostalCode: m.zipPostalCode ?? '',
    country: m.country ?? '',
    lat: m.lat,
    lng: m.lng,
  };
}

export async function harvestBulk(): Promise<SweepResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(BULK_URL, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Bulk source HTTP ${res.status}: ${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as { machines?: Machine[] };
    const raw = data.machines ?? [];
    const machines = raw.filter(isValid).map(normalize);
    if (machines.length === 0) throw new Error('Bulk source returned 0 machines');
    return {
      machines,
      requestCount: 1,
      failedTiles: 0,
      source: BULK_URL,
    };
  } finally {
    clearTimeout(timer);
  }
}
