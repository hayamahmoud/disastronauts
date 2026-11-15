// Real, sourced NASA facts (src/data/facts.json). Each fact has a trigger:
// the moment in the game it belongs to (a flare starts, you build a
// greenhouse…), or "roundEnd" for the podium's "What you learned" box.
// Text can contain {tokens} that are filled in from our real data files,
// so the numbers always match the data the game uses.

import factsFile from '../data/facts.json';
import { RADIATION_INFO } from '../services/DataService';

export type FactTrigger =
  | 'roundStart'
  | 'roundEnd'
  | 'solarFlare'
  | 'dustStorm'
  | 'coldNight'
  | 'supplyDrop'
  | 'greenhouse'
  | 'crewSick'
  | 'shieldMission'
  | 'taskIce' // finished a mini task (M4b)
  | 'taskSolar'
  | 'taskRegolith';

export interface Fact {
  id: string;
  trigger: FactTrigger;
  text: string;
  source: string; // short name shown under the fact
  url: string;
}

// Values that {tokens} in fact text are replaced with.
const TOKENS: Record<string, string> = {
  radiationPeriod: RADIATION_INFO.period,
  radiationReadings: RADIATION_INFO.readings.toLocaleString('en-GB'),
};

export function fillTokens(text: string): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => TOKENS[name] ?? whole);
}

export const FACTS: Fact[] = (factsFile as Fact[]).map((f) => ({ ...f, text: fillTokens(f.text) }));

export function factsFor(trigger: FactTrigger): Fact[] {
  return FACTS.filter((f) => f.trigger === trigger);
}

// The podium fact: the same seed always shows the same one.
export function factForRound(seed: number): Fact {
  const list = factsFor('roundEnd');
  return list[seed % list.length];
}
