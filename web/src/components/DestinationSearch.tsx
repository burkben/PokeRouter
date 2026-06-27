import { useEffect, useRef, useState } from 'react';
import { geocode, type GeocodeResult } from '../lib/geocode';

interface Props {
  onPick: (r: GeocodeResult) => void;
}

export default function DestinationSearch({ onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const r = await geocode(q, ctrl.signal);
        setResults(r);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Search failed');
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="search">
      <input
        type="text"
        placeholder="Search destination (address, city, place)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {loading && <span className="search-hint">Searching…</span>}
      {error && <span className="search-hint error">{error}</span>}
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery(r.label.split(',')[0]);
                  setOpen(false);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
