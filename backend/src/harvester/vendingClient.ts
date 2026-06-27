import type { ApiMachine, Bbox } from '../types';

const BASE =
  process.env.VENDING_API_BASE ?? 'https://api.vending.prod.pokemon.com/v1/machines';

// The locator API sits behind an Imperva/Incapsula WAF that challenges
// non-browser-looking clients (especially under load), returning a 403 HTML
// challenge page. Presenting a realistic browser header set avoids that.
const HEADERS: Record<string, string> = {
  authority: 'api.vending.prod.pokemon.com',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://vending.pokemon.com',
  referer: 'https://vending.pokemon.com/',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thrown for non-retryable responses (4xx other than 403/429). */
class NonRetryableError extends Error {}

/** Thrown for retryable responses; carries the HTTP status (0 = network/timeout). */
class RetryableError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface FetchOptions {
  retries?: number;
  timeoutMs?: number;
}

/**
 * Fetch the machines inside a bounding box. Retries transient failures
 * (403 WAF challenge / 429 / 5xx / network / timeout) with exponential backoff
 * + jitter. A 403 gets a longer backoff since it signals WAF rate-limiting.
 */
export async function fetchMachines(bbox: Bbox, opts: FetchOptions = {}): Promise<ApiMachine[]> {
  const retries = opts.retries ?? 6;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const url =
    `${BASE}?swLat=${bbox.swLat}&swLng=${bbox.swLng}` +
    `&neLat=${bbox.neLat}&neLng=${bbox.neLng}&unit=mi`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      if (res.ok) {
        const data = (await res.json()) as { machines?: ApiMachine[] };
        return data.machines ?? [];
      }
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw new RetryableError(res.status, `HTTP ${res.status}`);
      }
      const body = await res.text().catch(() => '');
      throw new NonRetryableError(`HTTP ${res.status}: ${body.slice(0, 160)}`);
    } catch (err) {
      lastErr = err;
      if (err instanceof NonRetryableError || attempt === retries) break;
      // WAF challenges (403) need a longer cooldown than ordinary throttling.
      const isWaf = err instanceof RetryableError && err.status === 403;
      const base = isWaf ? 2_000 : 400;
      const cap = isWaf ? 30_000 : 8_000;
      const backoff = Math.min(cap, base * 2 ** attempt) + Math.random() * 500;
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchMachines failed');
}
