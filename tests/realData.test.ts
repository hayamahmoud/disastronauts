// Milestone 5: real NASA data (DONKI flares, RadLab radiation, Mars Trek map,
// rover photos, facts). Checks the data files are sane and the game uses them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { createGame, step } from '../src/core/simulation';
import type { FlareRecord, GameState, RealFlare } from '../src/core/state';
import { terrainFromData } from '../src/core/terrain';
import radiationFile from '../src/data/radiation.json';
import {
  ROVER_PHOTOS,
  archivedFlares,
  loadFlares,
  loadTerrain,
  niceDate,
  photoForRound,
  toFlareRecords,
} from '../src/services/DataService';
import { FACTS, factForRound, factsFor, fillTokens, type FactTrigger } from '../src/ui/facts';

const DT = BALANCE.sim.fixedDt;

// --- Map ---

describe('real map (Jezero Crater)', () => {
  it('loads the bundled map as real (not placeholder) terrain', () => {
    const t = loadTerrain();
    expect(t).not.toBeNull();
    expect(t!.isPlaceholder).toBe(false);
    expect(t!.worldSize).toBe(BALANCE.map.worldSize);
    expect(t!.heights.length).toBe(t!.size * t!.size);
    expect(t!.heights.every(Number.isFinite)).toBe(true);
  });

  it('rejects broken map data', () => {
    expect(() => terrainFromData({ size: 3, worldSize: 100, heights: [0, 0, 0] })).toThrow();
    expect(() => terrainFromData({ size: 2, worldSize: 100, heights: [0, NaN, 0, 0] })).toThrow();
    const ok = terrainFromData({ size: 2, worldSize: 100, heights: [1, 2, 3, 4] });
    expect(ok.isPlaceholder).toBe(false);
  });
});

// --- Solar flares ---

describe('solar flares from NASA DONKI', () => {
  it('the archived flares are C, M or X class, oldest first, and never called live', () => {
    const set = archivedFlares();
    expect(set.live).toBe(false);
    expect(set.flares.length).toBeGreaterThan(0);
    for (const f of set.flares) expect(['C', 'M', 'X']).toContain(f.classLetter);
    const times = set.flares.map((f) => f.peakTime);
    expect([...times].sort()).toEqual(times);
  });

  it('reads DONKI records: skips weak or broken ones, accepts flrID, sorts by time', () => {
    const out = toFlareRecords([
      { flrID: 'b', classType: 'X1.2', peakTime: '2024-05-02T00:00Z' },
      { id: 'a', classType: 'M5.0', peakTime: '2024-05-01T00:00Z' },
      { id: 'weak', classType: 'B9.0', peakTime: '2024-05-01T00:00Z' },
      { id: 'no-time', classType: 'C1.0' },
      null,
      'junk',
    ]);
    expect(out.map((f) => f.id)).toEqual(['a', 'b']);
    expect(out.map((f) => f.classLetter)).toEqual(['M', 'X']);
  });

  describe('live mode ("Today\'s space weather")', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

    it('is LIVE only when the download worked', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }) // api.nasa.gov
        .mockResolvedValueOnce(ok([{ flrID: 'live1', classType: 'M1.0', peakTime: '2026-11-01T00:00Z' }])); // CCMC
      vi.stubGlobal('fetch', fetchMock);
      const set = await loadFlares(true);
      expect(set.live).toBe(true);
      expect(set.flares.map((f) => f.id)).toEqual(['live1']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('falls back to the archived flares (not live) when NASA fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const set = await loadFlares(true);
      expect(set.live).toBe(false);
      expect(set.liveProblem).toBe('offline');
      expect(set.flares.length).toBe(archivedFlares().flares.length);
    });

    it('treats an empty answer as a fallback too', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok([])));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect((await loadFlares(true)).live).toBe(false);
    });

    it('does not download anything when live mode is off', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      expect((await loadFlares(false)).live).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // Run the game until `count` solar flares have hit; return what each one was.
  function collectFlares(state: GameState, count: number) {
    const seen: { flareClass: string | null; realFlare: RealFlare | null }[] = [];
    for (let i = 0; i < Math.round(20000 / DT) && seen.length < count; i++) {
      for (const e of step(state, [], DT)) {
        if (e.type === 'DisasterStarted' && e.kind === 'solarFlare') {
          seen.push({ flareClass: state.disaster!.flareClass, realFlare: state.disaster!.realFlare });
        }
      }
    }
    return seen;
  }

  function quietGame(seed: number, flares?: FlareRecord[]): GameState {
    const s = createGame({ seed, players: [{ id: 'p1', name: 'One' }], rounds: false, flares });
    for (const p of s.pickups) {
      p.active = false;
      p.respawnTimer = 1e9;
    }
    return s;
  }

  const TWO: FlareRecord[] = [
    { id: 'f1', classType: 'C3.0', peakTime: '2024-05-01T00:00Z', classLetter: 'C' },
    { id: 'f2', classType: 'X1.0', peakTime: '2024-05-02T00:00Z', classLetter: 'X' },
  ];

  it('each flare replays the next real one, in order, and wraps around', () => {
    const seen = collectFlares(quietGame(5, TWO), 3);
    expect(seen).toHaveLength(3);
    for (const f of seen) {
      expect(f.realFlare).not.toBeNull();
      expect(f.flareClass).toBe(f.realFlare!.classType[0]); // class comes from the real flare
    }
    const ids = seen.map((f) => f.realFlare!.id);
    expect(ids[1]).not.toBe(ids[0]);
    expect(ids[2]).toBe(ids[0]); // only two in the list: back to the start
  });

  it('the same seed replays the same flares', () => {
    const flares = archivedFlares().flares;
    const a = collectFlares(quietGame(9, flares), 3).map((f) => f.realFlare!.id);
    const b = collectFlares(quietGame(9, flares), 3).map((f) => f.realFlare!.id);
    expect(a).toEqual(b);
  });

  it('without flare data, flares still happen with a random class', () => {
    const seen = collectFlares(quietGame(5), 2);
    expect(seen.length).toBe(2);
    for (const f of seen) {
      expect(f.realFlare).toBeNull();
      expect(['C', 'M', 'X']).toContain(f.flareClass);
    }
  });
});

// --- Radiation ---

describe('radiation from NASA RadLab', () => {
  it('crew radiation damage comes from the real Mars dose', () => {
    expect(radiationFile.readings).toBeGreaterThan(1000);
    expect(BALANCE.crew.radiationDamagePerSol).toBeCloseTo(radiationFile.medianMicroGrayPerSol * 0.44, 6);
  });
});

// --- Rover photos ---

describe('rover photos', () => {
  it('every photo has an image, a credit and a caption', () => {
    expect(ROVER_PHOTOS.length).toBeGreaterThan(0);
    for (const p of ROVER_PHOTOS) {
      expect(p.imageUrl).toMatch(/^https:\/\//);
      expect(p.pageUrl).toMatch(/^https:\/\//);
      expect(p.credit).toContain('NASA');
      expect(p.caption.length).toBeGreaterThan(5);
    }
  });

  it('the same seed gives the same photo', () => {
    expect(photoForRound(1234)).toEqual(photoForRound(1234));
  });
});

// --- Facts ---

describe('facts', () => {
  const TRIGGERS: FactTrigger[] = ['roundStart', 'roundEnd', 'solarFlare', 'dustStorm', 'coldNight', 'supplyDrop', 'greenhouse', 'crewSick', 'shieldMission', 'taskIce', 'taskSolar', 'taskRegolith'];

  it('every fact has text, a NASA source and a link, and unique ids', () => {
    const ids = new Set<string>();
    for (const f of FACTS) {
      expect(f.text.length).toBeGreaterThan(10);
      expect(f.source.length).toBeGreaterThan(0);
      expect(f.url).toMatch(/^https:\/\/[^ ]*(nasa\.gov)\//);
      expect(TRIGGERS).toContain(f.trigger);
      expect(f.text).not.toMatch(/\{\w+\}/); // every {token} was filled in
      ids.add(f.id);
    }
    expect(ids.size).toBe(FACTS.length);
  });

  it('every trigger has at least one fact', () => {
    for (const t of TRIGGERS) expect(factsFor(t).length).toBeGreaterThan(0);
  });

  it('fills tokens from the real data, and leaves unknown ones alone', () => {
    expect(fillTokens('{radiationPeriod}')).toBe(radiationFile.period);
    expect(fillTokens('{nope}')).toBe('{nope}');
  });

  it('the podium fact is a roundEnd fact and the same for the same seed', () => {
    expect(factForRound(42).trigger).toBe('roundEnd');
    expect(factForRound(42)).toEqual(factForRound(42));
  });
});

describe('dates', () => {
  it('shows NASA times as friendly UTC dates', () => {
    expect(niceDate('2024-05-14T16:51Z')).toBe('14 May 2024');
    expect(niceDate('2024-05-01')).toBe('1 May 2024');
  });
});

// --- The whole thing together ---

describe('a full round on the real map', () => {
  it('bots move around, stay on the map and score points', () => {
    const terrain = loadTerrain()!;
    const s = createGame({
      seed: 21,
      terrain,
      flares: archivedFlares().flares,
      players: [
        { id: 'p1', name: 'You' },
        { id: 'p2', name: 'Rusty', bot: 'grower' },
        { id: 'p3', name: 'Nova', bot: 'shielder' },
        { id: 'p4', name: 'Comet', bot: 'balanced' },
      ],
      lobbySeconds: 0,
    });
    const starts = s.players.map((p) => ({ ...p.pos }));
    while (s.round.phase !== 'ended') step(s, [], DT);
    const half = terrain.worldSize / 2;
    s.players.forEach((p, i) => {
      expect(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z)).toBe(true);
      expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(half);
      expect(Math.abs(p.pos.z)).toBeLessThanOrEqual(half);
      if (p.bot) expect(p.pos).not.toEqual(starts[i]); // bots didn't get stuck at home
    });
    const bots = s.round.results!.filter((r) => r.playerId !== 'p1');
    for (const b of bots) expect(b.score.total).toBeGreaterThan(0);
  });
});
