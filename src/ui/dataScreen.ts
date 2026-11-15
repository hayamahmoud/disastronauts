// The "Real NASA Data" screen: every NASA dataset the game uses, what it
// changes in the game, and whether it is LIVE (downloaded just now) or
// ARCHIVED (saved in the game). It also says honestly where the game bends
// the real data to make it playable. Opened from the menu and the podium.

import { BALANCE } from '../config/balance';
import {
  FLARES_INFO,
  MAP_INFO,
  RADIATION_INFO,
  ROVER_PHOTOS,
  ROVER_PHOTOS_INFO,
  archivedFlares,
  niceDate,
  type FlareSet,
} from '../services/DataService';
import { el } from './components';
import { FACTS } from './facts';

// What the game knows about its data right now.
export interface DataStatus {
  flares: FlareSet | null; // null on the menu: nothing has been loaded yet
  realMap: boolean | null; // false = the placeholder crater is being used
}

// --- The "Today's space weather" setting (saved in this browser) ---

const LIVE_KEY = 'disastronauts.liveSpaceWeather';

export function wantsLiveSpaceWeather(): boolean {
  try {
    return window.localStorage.getItem(LIVE_KEY) === '1';
  } catch {
    return false; // storage blocked (private window): just use archived data
  }
}

function setLiveSpaceWeather(on: boolean): void {
  try {
    window.localStorage.setItem(LIVE_KEY, on ? '1' : '0');
  } catch {
    // Can't save: the setting just won't be remembered.
  }
}

// --- The screen ---

export function openDataScreen(status: DataStatus): void {
  const dialog = el('dialog', 'start-help data-screen');
  dialog.setAttribute('aria-label', 'Real NASA Data');
  const close = el('button', 'settings-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  dialog.append(close, el('h2', '', '🛰️ Real NASA Data'));
  dialog.appendChild(
    el('p', '', 'This game is built from real NASA data. Here is each dataset, what it changes in the game, and where it came from.'),
  );

  // 1. Solar flares
  const flares = status.flares ?? archivedFlares();
  const flareCard = card(
    '☀️ Solar flares',
    'NASA DONKI (space weather database)',
    'Which solar flares hit your base, and how strong each one is (C, M or X class).',
  );
  if (status.flares?.live) {
    flareCard.append(liveBadge(`Downloaded just now: ${flares.flares.length} flares from ${niceDate(flares.startDate)} to ${niceDate(flares.endDate)}`));
  } else {
    flareCard.append(archivedBadge(flares.startDate, flares.endDate, `${FLARES_INFO.count} flares`));
    if (status.flares?.liveProblem) {
      flareCard.append(el('p', 'data-note', `We tried to download today's flares but couldn't (${status.flares.liveProblem}), so this round used the saved ones.`));
    }
  }
  flareCard.append(
    simple(
      'These flares were seen from near Earth. In the game, every one of them reaches your base on Mars. ' +
        `Real flares last minutes to hours; here each lasts ${BALANCE.disasters.solarFlare.duration} seconds.`,
    ),
    sourceLink(FLARES_INFO.source, FLARES_INFO.sourceUrl),
    liveToggle(),
  );
  dialog.appendChild(flareCard);

  // 2. Radiation on Mars
  const rad = RADIATION_INFO;
  const radCard = card(
    '☢️ Radiation on Mars',
    'NASA OSDR RadLab: the radiation detector on the Curiosity rover',
    'How fast your crew gets hurt when their Shield is too weak.',
  );
  radCard.append(
    archivedBadge(rad.period, null, `${rad.readings.toLocaleString('en-GB')} readings`),
    el('p', 'data-note', `Typical reading: ${rad.medianMicroGrayPerHour} micrograys per hour, about ${rad.medianMicroGrayPerSol} per sol (Mars day).`),
    simple(
      'Curiosity measures this in Gale Crater, not in Jezero, but it is the same Martian surface. ' +
        'Real radiation this weak would take years to hurt anyone; the game speeds it up a lot so you can see it.',
    ),
    sourceLink('NASA OSDR RadLab', rad.sourceUrl),
  );
  dialog.appendChild(radCard);

  // 3. The map
  const mapCard = card(
    '🗺️ The map: Jezero Crater',
    'Mars Global Surveyor MOLA heights and the MRO CTX photo mosaic, as shown in NASA Mars Trek',
    'The shape of the ground: the crater rim, the hills and the flat floor you build on.',
  );
  if (status.realMap === false) {
    mapCard.append(el('p', 'data-badge is-warn', 'The real map could not be loaded this time: you are playing on a made-up practice crater.'));
  } else {
    mapCard.append(el('p', 'data-badge is-archived', 'Archived NASA data (saved in the game)'));
  }
  mapCard.append(
    simple(
      `The real area is ${MAP_INFO.mapKm} km across; in the game it is squeezed into a map you can drive across in a minute. ` +
        `Hills are made ${MAP_INFO.verticalExaggeration} times taller so they are easier to see.`,
    ),
    sourceLink('NASA Mars Trek', MAP_INFO.sourceUrl),
    sourceLink('USGS: MOLA elevation data', MAP_INFO.dataUrl),
    el('p', 'data-credit', 'Map photo: NASA/JPL/MSSS/The Murray Lab (CTX mosaic).'),
  );
  dialog.appendChild(mapCard);

  // 4. Rover photos
  const sols = ROVER_PHOTOS.map((p) => p.sol);
  const photoCard = card(
    '📷 Rover photo cards',
    'NASA Perseverance rover raw images',
    'The photo card you win when you survive a disaster or win a round.',
  );
  photoCard.append(
    el('p', 'data-badge is-archived', `Archived NASA photos: ${ROVER_PHOTOS.length} pictures from sol ${Math.min(...sols)} to sol ${Math.max(...sols)} of the mission`),
    simple('These are raw pictures, straight from the rover, chosen by us. Credit: NASA/JPL-Caltech.'),
    sourceLink(ROVER_PHOTOS_INFO.source, ROVER_PHOTOS_INFO.sourceUrl),
  );
  dialog.appendChild(photoCard);

  // 5. Facts
  const factCard = card('💡 Fact pop-ups', 'NASA web pages', 'The "Real NASA fact!" boxes and the podium\'s "What you learned".');
  const seen = new Set<string>();
  for (const f of FACTS) {
    if (seen.has(f.url)) continue;
    seen.add(f.url);
    factCard.append(sourceLink(f.source, f.url));
  }
  dialog.appendChild(factCard);

  const done = el('button', 'settings-done', 'Back');
  done.type = 'button';
  dialog.appendChild(done);

  const shut = () => dialog.close();
  close.addEventListener('click', shut);
  done.addEventListener('click', shut);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

// --- Small pieces ---

function card(title: string, source: string, controls: string): HTMLElement {
  const box = el('section', 'data-card');
  box.append(el('h3', '', title), el('p', 'data-source', source));
  const what = el('p', 'data-controls');
  what.append(el('b', '', 'In the game: '), document.createTextNode(controls));
  box.appendChild(what);
  return box;
}

function liveBadge(text: string): HTMLElement {
  const p = el('p', 'data-badge is-live');
  p.append(el('span', 'data-live-dot'), el('b', '', 'LIVE '), document.createTextNode(text));
  return p;
}

// "Archived NASA data from 1 May 2024 to 31 May 2024 (181 flares)". `from` can be a year.
function archivedBadge(from: string, to: string | null, count: string): HTMLElement {
  const when = to ? `from ${niceDate(from)} to ${niceDate(to)}` : `from ${from}`;
  return el('p', 'data-badge is-archived', `Archived NASA data ${when} (${count})`);
}

function simple(text: string): HTMLElement {
  const p = el('p', 'data-simple');
  p.append(el('b', '', 'What we changed: '), document.createTextNode(text));
  return p;
}

function sourceLink(text: string, url: string): HTMLElement {
  const a = el('a', 'data-link', `${text} ↗`);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

function liveToggle(): HTMLElement {
  const label = el('label', 'data-toggle');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = wantsLiveSpaceWeather();
  box.addEventListener('change', () => setLiveSpaceWeather(box.checked));
  label.append(
    box,
    document.createTextNode(
      ` Today's space weather: next game, try to download the last ${BALANCE.liveData.donkiDays} days of real flares from NASA (needs internet; if it fails, the saved flares are used).`,
    ),
  );
  return label;
}
