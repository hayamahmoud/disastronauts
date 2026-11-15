// Plain-language glossary (M7): hard words like "sol" or "regolith" get a
// dotted underline. Hover (mouse) or tap (finger) shows one short sentence.
//
// The same styled bubble also replaces the browser's own tooltip for any
// element with a `title`, so every hover explanation looks the same and also
// works on touch screens (where `title` never shows).

import { el } from './components';

interface Term {
  word: string; // as shown in the bubble's heading
  match: RegExp; // which words in a sentence to underline
  text: string;
}

// SOURCE (sol length, 3–22 minute radio delay, ~43% sunlight): NASA NSSDCA
// Mars Fact Sheet https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html (see docs/DATA.md)
const TERMS: Term[] = [
  {
    word: 'Sol',
    match: /\bsols?\b/i,
    text: 'A sol is one day on Mars. It lasts 24 hours and 39 minutes, a bit longer than a day on Earth.',
  },
  {
    word: 'Regolith',
    match: /\bregolith\b/i,
    text: 'Regolith is the loose dust, soil and broken rock that covers Mars. Piled on a base, it blocks radiation.',
  },
  {
    word: 'Radiation dose',
    match: /\bradiation dose\b/i,
    text: 'A radiation dose is how much radiation your body soaks up. Shields keep the dose small.',
  },
  {
    word: 'Radiation',
    match: /\bradiation\b/i,
    text: 'Radiation is invisible energy from the Sun and deep space. Too much can make astronauts sick.',
  },
  {
    word: 'Solar flare',
    match: /\bsolar flares?\b|\bflares?\b/i,
    text: 'A solar flare is a sudden flash of energy from the Sun. It sends out a burst of extra radiation.',
  },
  {
    word: 'Dust storm',
    match: /\bdust storms?\b/i,
    text: 'Mars has giant dust storms. The dust blocks sunlight, so solar panels make much less power.',
  },
  {
    word: 'Solar panel',
    match: /\bsolar panels?\b/i,
    text: 'Solar panels turn sunlight into electricity. Mars gets less than half the sunlight Earth does.',
  },
  {
    word: 'Radio delay',
    match: /\bradio\b/i,
    text: 'Radio is as fast as light, but Mars is so far away that a message takes 3 to 22 minutes to reach Earth.',
  },
  {
    word: 'Life Support',
    match: /\blife support\b/i,
    text: 'Life Support is everything that keeps your crew alive: air to breathe, water and food.',
  },
  {
    word: 'Shielding',
    match: /\bshielding\b/i,
    text: 'Shielding is a thick layer, like soil or water, that stops radiation before it reaches the crew.',
  },
];

// A piece of a sentence: plain text, or a glossary word with its explanation.
export type Piece = { text: string; term?: { word: string; tip: string } };

// Splits a sentence into plain text and glossary words (no DOM, so it can be tested).
// Each term is underlined only once per sentence, so it doesn't get busy.
export function splitTerms(text: string): Piece[] {
  const pieces: Piece[] = [];
  let rest = text;
  const used = new Set<Term>();
  while (rest) {
    // Find the earliest glossary word still left in the sentence (longest wins a tie).
    let best: { term: Term; index: number; length: number } | null = null;
    for (const term of TERMS) {
      if (used.has(term)) continue;
      const m = term.match.exec(rest);
      if (m && (!best || m.index < best.index || (m.index === best.index && m[0].length > best.length))) {
        best = { term, index: m.index, length: m[0].length };
      }
    }
    if (!best) break;
    used.add(best.term);
    if (best.index > 0) pieces.push({ text: rest.slice(0, best.index) });
    pieces.push({ text: rest.slice(best.index, best.index + best.length), term: { word: best.term.word, tip: best.term.text } });
    rest = rest.slice(best.index + best.length);
  }
  if (rest) pieces.push({ text: rest });
  return pieces;
}

// The same, as page elements: glossary words become underlined <span class="term">.
export function termify(text: string): Node[] {
  return splitTerms(text).map((p) => {
    if (!p.term) return document.createTextNode(p.text);
    const span = el('span', 'term', p.text);
    span.dataset.term = p.term.word;
    span.dataset.tip = p.term.tip;
    span.tabIndex = 0; // keyboard users can focus it too
    return span;
  });
}

// Puts a sentence into an element, with glossary words underlined.
export function setTermText(target: HTMLElement, text: string): void {
  target.replaceChildren(...termify(text));
}

// One bubble for the whole page. Call once at startup.
export function installTooltips(): void {
  const bubble = el('div', 'tooltip is-hidden');
  bubble.setAttribute('role', 'tooltip');
  const head = el('div', 'tooltip-head');
  const body = el('div', 'tooltip-text');
  bubble.append(head, body);
  document.body.appendChild(bubble);
  let current: HTMLElement | null = null;
  let hideTimer = 0;

  // The element under the pointer that has something to explain.
  // A `title` is moved into data-tip so the browser's own tooltip doesn't
  // also pop up. (Code that sets `title` again later is picked up next time.)
  function tipTarget(target: EventTarget | null): HTMLElement | null {
    const node = (target as HTMLElement | null)?.closest?.<HTMLElement>('[title], [data-tip]');
    if (!node) return null;
    const title = node.getAttribute('title');
    if (title) {
      node.dataset.tip = title;
      node.removeAttribute('title');
    }
    return node.dataset.tip ? node : null;
  }

  function show(target: HTMLElement, seconds: number) {
    current = target;
    head.textContent = target.dataset.term ?? '';
    head.hidden = !target.dataset.term;
    body.textContent = target.dataset.tip ?? '';
    bubble.classList.remove('is-hidden');
    // Place it under the element, or above if there's no room, kept on screen.
    const r = target.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const margin = 8;
    let x = r.left + r.width / 2 - b.width / 2;
    x = Math.max(margin, Math.min(window.innerWidth - b.width - margin, x));
    let y = r.bottom + margin;
    if (y + b.height > window.innerHeight - margin) y = Math.max(margin, r.top - b.height - margin);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    window.clearTimeout(hideTimer);
    if (seconds > 0) hideTimer = window.setTimeout(hide, seconds * 1000);
  }
  function hide() {
    current = null;
    bubble.classList.add('is-hidden');
  }

  // Mouse: show while hovering.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = tipTarget(e.target);
    if (t && t !== current) show(t, 0);
    else if (!t && current) hide();
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && current && !current.contains(e.relatedTarget as Node | null)) hide();
  });
  // Finger: tap to show for a few seconds (tap again or elsewhere to hide).
  // Buttons still do their job; only non-button things show a bubble on tap.
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const t = tipTarget(e.target);
    if (!t || t.closest('button, input, .touch-stick')) return hide();
    if (t === current) hide();
    else show(t, 4);
  });
  // Keyboard: focusing a glossary word shows it.
  document.addEventListener('focusin', (e) => {
    const t = (e.target as HTMLElement).closest?.<HTMLElement>('.term');
    if (t) show(t, 0);
  });
  document.addEventListener('focusout', hide);
}
