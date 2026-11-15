// Loads the real NASA data the game uses. Everything is bundled as JSON in
// src/data/ (made by the Python tools in tools/), so the game works offline.
// The one exception is the optional "Today's space weather" mode, which asks
// NASA DONKI for the latest solar flares and falls back to the bundled ones.
// The game never calls live data "live" unless it actually loaded.

import type { FlareClass } from '../config/balance';
import { BALANCE } from '../config/balance';
import type { FlareRecord, TerrainGrid } from '../core/state';
import { terrainFromData } from '../core/terrain';
import flaresFile from '../data/flares.json';
import mapFile from '../data/map_heights.json';
import radiationFile from '../data/radiation.json';
import photosFile from '../data/rover_photos.json';

// --- Solar flares (NASA DONKI) ---

export interface FlareSet {
  flares: FlareRecord[];
  live: boolean; // true only if the live download worked
  startDate: string; // the date range the flares come from (YYYY-MM-DD)
  endDate: string;
  // Why we're showing archived data when live was asked for (null otherwise).
  liveProblem: string | null;
}

// Where to ask for today's flares, in order. api.nasa.gov is NASA's official
// gateway (the browser always uses DEMO_KEY: a real key in a web page is
// visible to everyone). In Nov 2026 it answered 404 for DONKI, so we also ask
// NASA CCMC's own DONKI server, which needs no key and allows browser requests.
const DONKI_LIVE_URLS = [
  'https://api.nasa.gov/DONKI/FLR?api_key=DEMO_KEY&',
  'https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?',
];
const CLASS_RE = /^([CMX])(\d+(?:\.\d+)?)$/;

export const FLARES_INFO = { source: flaresFile.source, sourceUrl: flaresFile.sourceUrl, count: flaresFile.flares.length };

// Bundled flares from tools/fetch_donki.py (an archived date range).
export function archivedFlares(): FlareSet {
  return {
    flares: toFlareRecords(flaresFile.flares),
    live: false,
    startDate: flaresFile.startDate,
    endDate: flaresFile.endDate,
    liveProblem: null,
  };
}

// "Today's space weather": the last few weeks of flares from DONKI.
// Falls back to the archived flares if the request fails, is slow, or finds none.
export async function loadFlares(wantLive: boolean): Promise<FlareSet> {
  if (!wantLive) return archivedFlares();
  const L = BALANCE.liveData;
  const end = new Date();
  const start = new Date(end.getTime() - L.donkiDays * 24 * 3600 * 1000);
  const range = { startDate: isoDate(start), endDate: isoDate(end) };
  // One time limit for all tries together, so the game never waits too long.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), L.timeoutSeconds * 1000);
  let why = 'download failed';
  try {
    for (const base of DONKI_LIVE_URLS) {
      try {
        const response = await fetch(`${base}startDate=${range.startDate}&endDate=${range.endDate}`, { signal: timeout.signal });
        if (!response.ok) throw new Error(`NASA answered ${response.status}`);
        const raw: unknown = await response.json();
        const flares = toFlareRecords(Array.isArray(raw) ? raw : []);
        // A quiet Sun is real too, but with no flares there is nothing to replay.
        if (flares.length === 0) throw new Error('no big flares in the last few weeks');
        return { flares, live: true, ...range, liveProblem: null };
      } catch (err) {
        why = timeout.signal.aborted ? 'NASA took too long to answer' : err instanceof Error ? err.message : why;
        if (timeout.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  console.warn(`Live DONKI flares unavailable (${why}); using archived flares.`);
  return { ...archivedFlares(), liveProblem: why };
}

// Keep C, M and X flares (A and B are too weak to matter), oldest first.
// Works on both the bundled file and DONKI's own format.
export function toFlareRecords(raw: unknown[]): FlareRecord[] {
  const out: FlareRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const classType = String(f.classType ?? '').trim();
    const match = CLASS_RE.exec(classType);
    const id = String(f.id ?? f.flrID ?? '');
    const peakTime = String(f.peakTime ?? '');
    if (!match || !id || !peakTime) continue;
    out.push({ id, classType, peakTime, classLetter: match[1] as FlareClass });
  }
  return out.sort((a, b) => a.peakTime.localeCompare(b.peakTime));
}

// --- Map (MOLA elevation for Jezero Crater, via Mars Trek) ---

// The real Jezero map, or null (the game then uses the placeholder crater).
export function loadTerrain(): TerrainGrid | null {
  try {
    if (mapFile.worldSize !== BALANCE.map.worldSize) throw new Error('map size does not match BALANCE.map.worldSize');
    return terrainFromData(mapFile);
  } catch (err) {
    console.warn('Real map data could not be used; falling back to the placeholder crater.', err);
    return null;
  }
}

export const MAP_INFO = {
  place: mapFile.place,
  centerLat: mapFile.centerLat,
  centerLon: mapFile.centerLon,
  mapKm: mapFile.mapKm,
  metersPerStud: mapFile.metersPerStud,
  verticalExaggeration: mapFile.verticalExaggeration,
  sourceUrl: mapFile.sourceUrl,
  dataUrl: mapFile.dataUrl,
};

// --- Radiation (OSDR RadLab, Curiosity RAD) ---

export const RADIATION_INFO = radiationFile;

// --- Rover photos (Perseverance raw images) ---

export interface RoverPhoto {
  id: string;
  rover: string;
  sol: number;
  earthDate: string;
  camera: string;
  imageUrl: string;
  pageUrl: string;
  credit: string;
  caption: string;
}

export const ROVER_PHOTOS: RoverPhoto[] = photosFile.photos;
export const ROVER_PHOTOS_INFO = { source: photosFile.source, sourceUrl: photosFile.sourceUrl };

// The same seed always gives the same photo.
export function photoForRound(seed: number): RoverPhoto | null {
  return ROVER_PHOTOS.length ? ROVER_PHOTOS[seed % ROVER_PHOTOS.length] : null;
}

// --- Helpers ---

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// "2024-05-14T16:51Z" -> "14 May 2024" (dates are UTC, like NASA's).
export function niceDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
