// Small reusable UI building blocks. Their look comes from classes in
// theme.css, so restyling a component there restyles it everywhere.

import { UI_ICONS, type UiIconId } from '../assets/manifest';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// A rounded card that floats over the game.
export function createPanel(parent: HTMLElement): HTMLDivElement {
  const panel = el('div', 'panel');
  parent.appendChild(panel);
  return panel;
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

// One "icon + value" line inside a panel. Returns a setter for the value.
export function createStat(parent: HTMLElement, icon: UiIconId, label: string) {
  const row = el('div', 'stat');
  row.title = label;
  const iconBox = el('span', 'stat-icon');
  iconBox.appendChild(createIcon(icon));
  row.append(iconBox, el('span', 'stat-value'));
  parent.appendChild(row);
  const value = row.querySelector('.stat-value') as HTMLSpanElement;
  return {
    set(text: string, isFull = false) {
      if (value.textContent !== text) value.textContent = text;
      row.classList.toggle('is-full', isFull);
    },
  };
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

// A resource bar: icon, a colored bar, and a short value + trend arrow.
export function createBar(parent: HTMLElement, icon: UiIconId, label: string) {
  const row = el('div', 'bar-row');
  row.title = label;
  const iconBox = el('span', 'bar-icon');
  iconBox.appendChild(createIcon(icon));
  const track = el('div', 'bar-track');
  const fill = el('div', 'bar-fill');
  track.appendChild(fill);
  const value = el('span', 'bar-value');
  const trend = el('span', 'bar-trend');
  row.append(iconBox, track, value, trend);
  parent.appendChild(row);
  return {
    // fraction 0–1 sets the bar; trend > 0 shows ▲, < 0 shows ▼.
    set(fraction: number, text: string, trendValue = 0, level: Level = levelFor(fraction)) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
      row.dataset.level = level;
      if (value.textContent !== text) value.textContent = text;
      const arrow = trendValue > 0.5 ? '▲' : trendValue < -0.5 ? '▼' : '';
      if (trend.textContent !== arrow) trend.textContent = arrow;
      trend.dataset.dir = trendValue > 0 ? 'up' : 'down';
    },
    setTitle(text: string) {
      row.title = text;
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
