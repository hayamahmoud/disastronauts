// M7 polish: the tutorial steps, the combo counter and the glossary word finder.
// (All plain logic; the screens that use them are checked by playing.)

import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import type { GameEvent } from '../src/core/events';
import { createCombo } from '../src/ui/combo';
import { splitTerms } from '../src/ui/glossary';
import { advanceTutorial, createTutorialProgress } from '../src/ui/tutorialSteps';

const ME = 'p1';
const grab = (playerId = ME): GameEvent => ({ type: 'PickupCollected', playerId, pickupId: 1, kind: 'ice' });
const unload = (playerId = ME): GameEvent => ({
  type: 'CargoDeposited',
  playerId,
  baseId: 'b1',
  itemCount: 3,
  buildPoints: 3,
  items: { crate: 0, ice: 3, regolith: 0, solar: 0 },
});

describe('tutorial steps', () => {
  const T = BALANCE.tutorial;

  it('goes move → grab → home → bars → done → finished', () => {
    const p = createTutorialProgress();
    const start = { x: 0, z: 0 };
    expect(advanceTutorial(p, start, [], ME, 0)).toBe(false);
    expect(p.step).toBe('move');

    // Walking far enough finishes "move".
    expect(advanceTutorial(p, { x: T.walkDistance, z: 0 }, [], ME, 1)).toBe(true);
    expect(p.step).toBe('grab');

    // Grabbing enough pickups finishes "grab".
    for (let i = 0; i < T.grabCount - 1; i++) advanceTutorial(p, start, [grab()], ME, 2);
    expect(p.step).toBe('grab');
    advanceTutorial(p, start, [grab()], ME, 3);
    expect(p.step).toBe('home');

    // Unloading at home finishes "home".
    advanceTutorial(p, start, [unload()], ME, 4);
    expect(p.step).toBe('bars');

    // "bars" and "done" each stay up for a few seconds.
    advanceTutorial(p, start, [], ME, 4 + T.barsSeconds - 0.1);
    expect(p.step).toBe('bars');
    advanceTutorial(p, start, [], ME, 4 + T.barsSeconds);
    expect(p.step).toBe('done');
    advanceTutorial(p, start, [], ME, 4 + T.barsSeconds + T.doneSeconds);
    expect(p.step).toBe('finished');
    expect(advanceTutorial(p, start, [grab()], ME, 100)).toBe(false);
  });

  it('ignores what other players do', () => {
    const p = createTutorialProgress();
    advanceTutorial(p, { x: 0, z: 0 }, [], ME, 0);
    advanceTutorial(p, { x: 0, z: 0 }, [grab('p2'), unload('p2')], ME, 1);
    expect(p.step).toBe('move');
    expect(p.grabbed).toBe(0);
  });

  it('lets fast players skip ahead', () => {
    const p = createTutorialProgress();
    advanceTutorial(p, { x: 0, z: 0 }, [], ME, 0);
    // A grab before walking far skips "move"; an unload before 3 grabs skips "grab".
    advanceTutorial(p, { x: 0, z: 0 }, [grab()], ME, 1);
    expect(p.step).toBe('grab');
    advanceTutorial(p, { x: 0, z: 0 }, [unload()], ME, 2);
    expect(p.step).toBe('home');
    advanceTutorial(p, { x: 0, z: 0 }, [], ME, 3);
    expect(p.step).toBe('bars');
  });
});

describe('combo counter', () => {
  it('counts quick grabs and resets after a pause', () => {
    const c = createCombo(1);
    expect(c.hit(0)).toBe(1);
    expect(c.hit(0.5)).toBe(2);
    expect(c.hit(1.4)).toBe(3);
    expect(c.current(2)).toBe(3);
    expect(c.current(2.5)).toBe(0); // the window passed
    expect(c.hit(3)).toBe(1); // starts again
  });
});

describe('glossary words', () => {
  const words = (text: string) => splitTerms(text).filter((p) => p.term).map((p) => p.term!.word);

  it('finds glossary words and keeps the rest of the sentence', () => {
    const pieces = splitTerms('Need regolith for Shielding!');
    expect(pieces.map((p) => p.text).join('')).toBe('Need regolith for Shielding!');
    expect(words('Need regolith for Shielding!')).toEqual(['Regolith', 'Shielding']);
  });

  it('prefers the longer phrase and underlines each word once', () => {
    expect(words('Your radiation dose went up.')).toEqual(['Radiation dose']);
    expect(words('Sol 3. Another sol!')).toEqual(['Sol']);
  });

  it('leaves sentences with no glossary words alone', () => {
    expect(splitTerms('Walk home!')).toEqual([{ text: 'Walk home!' }]);
  });
});
