// The first-round tutorial (M7): a coach card at the bottom of the screen
// with one short instruction at a time. It moves on by itself when you do the
// thing (see tutorialSteps.ts). It only runs once per browser, can be skipped,
// and can be switched back on from the menu's Settings.
//
// While it runs, `data-tutorial="<step>"` is set on the UI root so CSS can
// make the thing being explained glow (the joystick, the bars, the map).

import { BALANCE } from '../config/balance';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/state';
import { findPlayer } from '../core/state';
import { el } from './components';
import { advanceTutorial, createTutorialProgress, type TutorialStep } from './tutorialSteps';

const STORAGE_KEY = 'disastronauts.tutorialDone';

// Has this browser already finished (or skipped) the tutorial?
export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false; // storage blocked: show it (it's short and can be skipped)
  }
}
export function setTutorialDone(done: boolean): void {
  try {
    if (done) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage is optional. */
  }
}

const touch = () => document.body.classList.contains('is-touch');

// One short sentence per step (keyboard and touch versions where they differ).
function stepText(step: TutorialStep, grabbed: number): { icon: string; text: string } {
  const need = BALANCE.tutorial.grabCount;
  switch (step) {
    case 'move':
      return touch()
        ? { icon: '🕹️', text: 'Push the joystick to walk and turn.' }
        : { icon: '⌨️', text: 'W and S walk. A and D turn.' };
    case 'grab':
      return { icon: '🎒', text: `Walk near ⚡ 🫁 🛡️ 🔨 to grab them! (${Math.min(grabbed, need)}/${need})` };
    case 'home':
      return { icon: '🏠', text: 'Walk home to unload. The map shows 🏠.' };
    case 'bars':
      return { icon: '📊', text: 'Keep these bars full so your crew stay healthy!' };
    default:
      return { icon: '🏆', text: 'You’re ready, Disastronaut! Biggest colony wins!' };
  }
}

export interface Tutorial {
  update(state: GameState, events: GameEvent[]): void;
}

export function createTutorial(root: HTMLElement, localPlayerId: string, onStepDone: () => void): Tutorial {
  const progress = createTutorialProgress();
  const card = el('div', 'tutorial is-hidden');
  card.setAttribute('role', 'status'); // screen readers read each new step
  const icon = el('span', 'tutorial-icon');
  const text = el('span', 'tutorial-text');
  const dots = el('span', 'tutorial-dots');
  const STEPS: TutorialStep[] = ['move', 'grab', 'home', 'bars', 'done'];
  for (let i = 0; i < STEPS.length; i++) dots.appendChild(el('i'));
  const skip = el('button', 'tutorial-skip', 'Skip');
  skip.type = 'button';
  skip.addEventListener('click', () => finish());
  card.append(icon, text, dots, skip);
  root.appendChild(card);

  let shownKey = '';
  let running = false;

  function finish() {
    progress.step = 'finished';
    setTutorialDone(true);
    card.classList.add('is-hidden');
    delete root.dataset.tutorial;
  }

  return {
    update(state, events) {
      if (progress.step === 'finished') return;
      if (state.round.phase === 'lobby') return; // wait for "GO!"
      if (state.round.phase === 'ended') return finish();
      const me = findPlayer(state, localPlayerId);
      if (!me) return;
      if (!running) {
        running = true;
        card.classList.remove('is-hidden');
      }
      if (advanceTutorial(progress, me.pos, events, localPlayerId, state.time)) {
        // (TypeScript can't see that advanceTutorial changed the step.)
        if ((progress.step as TutorialStep) === 'finished') return finish();
        onStepDone();
      }
      const t = stepText(progress.step, progress.grabbed);
      const key = `${progress.step}|${t.text}|${touch()}`;
      if (key === shownKey) return;
      const newStep = !shownKey.startsWith(`${progress.step}|`);
      shownKey = key;
      root.dataset.tutorial = progress.step;
      icon.textContent = t.icon;
      text.textContent = t.text;
      dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('is-on', i <= STEPS.indexOf(progress.step)));
      if (newStep) {
        // Restart the "pop" animation for each new step.
        card.classList.remove('is-pop');
        void card.offsetWidth;
        card.classList.add('is-pop');
      }
    },
  };
}
