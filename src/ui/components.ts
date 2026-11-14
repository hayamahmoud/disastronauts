// Small reusable UI building blocks. Their look comes from classes in
// theme.css, so restyling a component there restyles it everywhere.

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

// One "icon + value" line inside a panel. Returns a setter for the value.
export function createStat(parent: HTMLElement, icon: string, label: string) {
  const row = el('div', 'stat');
  row.title = label;
  row.append(el('span', 'stat-icon', icon), el('span', 'stat-value'));
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
