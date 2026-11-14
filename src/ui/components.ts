// Small reusable UI building blocks. Their look comes from classes in
// theme.css, so restyling a component there restyles it everywhere.

import { UI_ICONS, type UiIconId } from '../assets/manifest';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// An icon from the asset manifest: the designed image if there is one,
// otherwise (or if it fails to load) the emoji.
export function createIcon(id: UiIconId): HTMLSpanElement {
  const entry = UI_ICONS[id];
  const span = el('span', 'icon', entry.emoji);
  if (entry.file) {
    const img = el('img');
    img.src = import.meta.env.BASE_URL + entry.file;
    img.alt = '';
    img.onload = () => span.replaceChildren(img);
    // onerror: do nothing, the emoji stays.
  }
  return span;
}

// A small label pinned to a corner of the screen.
export function createBadge(parent: HTMLElement, text: string, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const badge = el('div', 'badge', text);
  Object.assign(badge.style, style);
  parent.appendChild(badge);
  return badge;
}

// A big centered message that fades out after `seconds`.
export function createMessage(parent: HTMLElement) {
  const box = el('div', 'message is-hidden');
  parent.appendChild(box);
  let timer = 0;
  return {
    show(text: string, seconds = 3) {
      box.textContent = text;
      box.classList.remove('is-hidden');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => box.classList.add('is-hidden'), seconds * 1000);
    },
  };
}

export type Level = 'good' | 'warn' | 'bad';

// Green / yellow / red from how full something is (0 to 1).
export function levelFor(fraction: number): Level {
  if (fraction >= 0.5) return 'good';
  if (fraction >= 0.25) return 'warn';
  return 'bad';
}

// A chip: [colored icon circle] 45 ▲, with a thin fill line along the bottom.
// `key` picks its color in theme.css; the level (good/warn/bad) turns it
// yellow or red, and a red chip wiggles.
export function createChip(parent: HTMLElement, key: string, icon: UiIconId, label: string) {
  const chip = el('div', 'chip');
  chip.dataset.key = key;
  chip.title = label;
  const iconBox = el('span', 'chip-icon');
  iconBox.appendChild(createIcon(icon));
  const value = el('span', 'chip-num');
  const trend = el('span', 'chip-trend');
  const bar = el('span', 'chip-bar');
  bar.appendChild(el('span'));
  chip.append(iconBox, value, trend, bar);
  parent.appendChild(chip);
  return {
    // fraction 0–1 fills the line; trend > 0 shows ▲, < 0 shows ▼.
    set(fraction: number, text: string, trendValue = 0, level: Level = levelFor(fraction)) {
      chip.style.setProperty('--v', Math.max(0, Math.min(1, fraction)).toFixed(3));
      chip.dataset.level = level;
      if (value.textContent !== text) value.textContent = text;
      const arrow = trendValue > 0.5 ? '▲' : trendValue < -0.5 ? '▼' : '';
      if (trend.textContent !== arrow) trend.textContent = arrow;
    },
    setTitle(text: string) {
      chip.title = text;
    },
    // A disaster is hitting this resource right now: pulse red and show a tiny tag.
    setHit(tag: string | null) {
      chip.classList.toggle('is-hit', tag !== null);
      if (tag === null) delete chip.dataset.hit;
      else chip.dataset.hit = tag;
    },
  };
}

// A big, clickable button (the UI layer ignores clicks except on these).
export function createButton(parent: HTMLElement, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'button');
  button.type = 'button';
  button.addEventListener('click', onClick);
  parent.appendChild(button);
  return button;
}
