/**
 * GPX 1.1 builder for "universal" route export.
 *
 * A GPX file is the lingua franca for handing a route to systems that don't
 * speak Google/Apple URLs — third-party nav apps, GPS units, and import tools.
 * We emit:
 *   - <wpt> waypoints for the origin, each vending-machine stop, and the
 *     destination (named, so they show up as labelled pins),
 *   - a <rte> with the ordered origin → stops → destination sequence, and
 *   - an optional <trk> carrying the detailed routed geometry as a track.
 *
 * Pure string building — no I/O — so it is trivially unit-testable.
 */

export interface GpxPoint {
  lat: number;
  lng: number;
  name?: string;
}

export interface BuildGpxInput {
  /** Document/route name shown in importers. */
  name?: string;
  origin: GpxPoint;
  destination: GpxPoint;
  stops?: GpxPoint[];
  /** Detailed routed geometry as [lng, lat] pairs (GeoJSON order) for the <trk>. */
  track?: Array<[number, number]>;
}

const ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

const xmlEscape = (s: string): string => s.replace(/[<>&'"]/g, (c) => ESCAPES[c]!);

/** Trim coordinates to ~0.1 m precision to keep files compact. */
const coord = (n: number): string => n.toFixed(6);

function waypoint(p: GpxPoint, fallbackName: string, type: string): string {
  return [
    `  <wpt lat="${coord(p.lat)}" lon="${coord(p.lng)}">`,
    `    <name>${xmlEscape(p.name ?? fallbackName)}</name>`,
    `    <type>${type}</type>`,
    `  </wpt>`,
  ].join('\n');
}

function routePoint(p: GpxPoint, fallbackName: string): string {
  return [
    `    <rtept lat="${coord(p.lat)}" lon="${coord(p.lng)}">`,
    `      <name>${xmlEscape(p.name ?? fallbackName)}</name>`,
    `    </rtept>`,
  ].join('\n');
}

export function buildGpx(input: BuildGpxInput): string {
  const { origin, destination } = input;
  const stops = input.stops ?? [];
  const name = input.name ?? 'PokeRouter route';

  const ordered: Array<{ point: GpxPoint; fallback: string; type: string }> = [
    { point: origin, fallback: 'Origin', type: 'origin' },
    ...stops.map((s, i) => ({ point: s, fallback: `Stop ${i + 1}`, type: 'stop' })),
    { point: destination, fallback: 'Destination', type: 'destination' },
  ];

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="PokeRouter"' +
      ' xmlns="http://www.topografix.com/GPX/1/1"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' xsi:schemaLocation="http://www.topografix.com/GPX/1/1' +
      ' http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${xmlEscape(name)}</name>`,
    '  </metadata>',
  ];

  for (const { point, fallback, type } of ordered) {
    lines.push(waypoint(point, fallback, type));
  }

  lines.push('  <rte>', `    <name>${xmlEscape(name)}</name>`);
  for (const { point, fallback } of ordered) {
    lines.push(routePoint(point, fallback));
  }
  lines.push('  </rte>');

  if (input.track && input.track.length > 0) {
    lines.push('  <trk>', `    <name>${xmlEscape(name)}</name>`, '    <trkseg>');
    for (const [lng, lat] of input.track) {
      lines.push(`      <trkpt lat="${coord(lat)}" lon="${coord(lng)}" />`);
    }
    lines.push('    </trkseg>', '  </trk>');
  }

  lines.push('</gpx>');
  return lines.join('\n') + '\n';
}
