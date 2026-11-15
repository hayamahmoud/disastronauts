import type { GameAudio } from '../audio/gameAudio';
import { openDataScreen } from './dataScreen';
import { setTutorialDone, tutorialDone } from './tutorial';

// The Shop button on the menu: opens the shop and shows your coins.
export interface MenuShop {
  open: () => void;
  coins: () => number;
  onChange: (listener: () => void) => () => void;
}

export interface LaunchOptions {
  players: number;
}

// Artwork and hit targets share one 16:9 coordinate system, including when resized.
export function createStartScreen(onStart: (options: LaunchOptions) => void, audio: GameAudio, shop: MenuShop) {
  const screen = document.createElement('main');
  screen.className = 'start-screen';
  screen.setAttribute('aria-label', 'Disastronauts starting page');
  screen.innerHTML = `
    <div class="start-artboard">
      <img class="start-art" src="${import.meta.env.BASE_URL}ui/starting-page-launch-bg.png" alt="Disastronauts: a cozy illustrated Mars outpost under a starry sky, with an astronaut and a rocket ready for launch." draggable="false">
      <button class="start-settings art-hit" aria-label="Settings and controls"></button>
      <button class="start-data" aria-label="Real NASA Data"><img src="${import.meta.env.BASE_URL}ui/nasa-logo.svg" alt="" class="dashboard-nasa-logo"></button>
      <button class="start-data start-shop" aria-label="Open shop"><svg class="dashboard-cart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l2.5 12h11l2-8H6"/><path d="M8 15l-1 3h12"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg></button>
      <section class="start-selector players-selector" aria-label="Players">
        <button class="art-hit previous" aria-label="Fewer players"></button>
        <output class="selector-value" aria-live="polite">4</output>
        <button class="art-hit next" aria-label="More players"></button>
      </section>
      <span class="rocket-ground-shadow" aria-hidden="true"></span>
      <button class="start-launch art-hit" aria-label="Start Game">
        <span class="rocket-exhaust" aria-hidden="true"></span>
        <img class="rocket-sprite" src="${import.meta.env.BASE_URL}ui/menu-rocket.png" alt="" draggable="false">
        <span class="rocket-label">Start Game<span class="start-triangle" aria-hidden="true"></span></span>
      </button>
    </div>
    <dialog class="start-help mission-settings" aria-label="Mission settings">
      <header class="scroll-dialog-header">
        <div class="console-title"><h2>Mission settings</h2></div>
        <button class="settings-close" aria-label="Close settings">×</button>
      </header>
      <p><strong>Players</strong> includes you and up to three computer rivals. After a 10-second countdown you get 5 minutes: the highest <strong>Colony Score</strong> wins!</p>
      <p>Move with <strong>WASD / arrow keys</strong> (on a tablet or phone: the <strong>joystick</strong>). Nearby supplies collect automatically. Return to your base to unload.</p>
      <p><strong>C</strong> changes the camera. <strong>P</strong> changes power priority. <strong>Space</strong> calls Earth for a supply drop. <strong>E</strong> (hold) does a mini task. <strong>B</strong> uses a Solar Boost.</p>
      <p>Every round earns <strong>coins</strong> and <strong>XP</strong>. Spend coins in the <strong>Shop</strong> on upgrades, power-ups and new looks. No real money, ever!</p>
      <fieldset class="audio-settings">
        <legend>Sound</legend>
        <label class="audio-mute"><input type="checkbox" class="settings-mute"> Mute all sound</label>
        <label class="audio-slider" for="settings-music"><span>Music</span><output for="settings-music" class="music-volume-value"></output></label>
        <input id="settings-music" class="settings-volume" type="range" min="0" max="100" step="1" aria-label="Music volume">
        <label class="audio-slider" for="settings-effects"><span>Sound effects</span><output for="settings-effects" class="effects-volume-value"></output></label>
        <input id="settings-effects" class="settings-volume" type="range" min="0" max="100" step="1" aria-label="Sound effects volume">
        <p class="audio-settings-note">Changes save automatically. Set a slider to 0 to turn it off.</p>
      </fieldset>
      <label><input type="checkbox" class="start-shadows" checked> Soft shadows</label>
      <label><input type="checkbox" class="start-tutorial"> Show the tutorial next game</label>
      <button class="settings-done">Ready!</button>
    </dialog>`;
  document.body.appendChild(screen);
  let players = 4;
  const playersOutput = screen.querySelector<HTMLOutputElement>('.players-selector output')!;
  const click = (selector: string, action: () => void) => { screen.querySelector<HTMLButtonElement>(selector)!.onclick = () => { audio.click(); action(); }; };
  click('.players-selector .previous', () => { players = players === 1 ? 4 : players - 1; playersOutput.value = String(players); });
  click('.players-selector .next', () => { players = players === 4 ? 1 : players + 1; playersOutput.value = String(players); });
  const dialog = screen.querySelector<HTMLDialogElement>('dialog')!;
  const musicSlider = screen.querySelector<HTMLInputElement>('#settings-music')!;
  const effectsSlider = screen.querySelector<HTMLInputElement>('#settings-effects')!;
  const mute = screen.querySelector<HTMLInputElement>('.settings-mute')!;
  function syncAudio() {
    const settings = audio.getSettings();
    mute.checked = settings.muted;
    for (const [slider, value, selector] of [
      [musicSlider, settings.musicVolume, '.music-volume-value'],
      [effectsSlider, settings.effectsVolume, '.effects-volume-value'],
    ] as const) {
      slider.value = String(Math.round(value * 100));
      screen.querySelector<HTMLOutputElement>(selector)!.value = `${slider.value}%`;
      slider.setAttribute('aria-valuetext', `${slider.value}%${settings.muted ? ' (muted)' : ''}`);
    }
  }
  const unsubscribeAudio = audio.onSettingsChange(syncAudio);
  syncAudio();
  musicSlider.oninput = () => audio.setVolume('music', Number(musicSlider.value) / 100);
  effectsSlider.oninput = () => audio.setVolume('effects', Number(effectsSlider.value) / 100);
  effectsSlider.onchange = () => audio.click();
  mute.onchange = () => audio.setMuted(mute.checked);
  // Tick to see the step-by-step tutorial again (it normally only runs once).
  const tutorialBox = screen.querySelector<HTMLInputElement>('.start-tutorial')!;
  tutorialBox.onchange = () => setTutorialDone(!tutorialBox.checked);
  click('.start-settings', () => { syncAudio(); tutorialBox.checked = !tutorialDone(); dialog.showModal(); });
  click('.start-data:not(.start-shop)', () => openDataScreen({ flares: null, realMap: null }));
  click('.start-shop', shop.open);
  const shopButton = screen.querySelector<HTMLButtonElement>('.start-shop')!;
  const showCoins = () => { shopButton.setAttribute('aria-label', `Open shop (${shop.coins()} coins)`); };
  const unsubscribeShop = shop.onChange(showCoins);
  showCoins();
  click('.settings-close', () => dialog.close());
  click('.settings-done', () => dialog.close());
  const launch = screen.querySelector<HTMLButtonElement>('.start-launch')!;
  launch.addEventListener('pointerenter', () => audio.hover());
  launch.addEventListener('focus', () => audio.hover());
  let launching = false;
  click('.start-launch', () => {
    if (launching) return;
    launching = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    audio.launch(reducedMotion ? 0.18 : 1.25);
    screen.classList.add('is-launching');
    screen.querySelectorAll('button').forEach(button => { button.disabled = true; });
    launch.setAttribute('aria-label', 'Launching');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallback);
      audio.enterGame();
      onStart({ players });
      unsubscribeAudio();
      unsubscribeShop();
      screen.remove();
    };
    launch.addEventListener('animationend', event => {
      if (event.target === launch) finish();
    });
    // Also finish when animations are disabled or the tab was backgrounded.
    const fallback = window.setTimeout(finish, reducedMotion ? 250 : 1450);
  });
  // Dev only: ?autostart=1 skips the menu (handy for testing and screenshots).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('autostart') === '1') {
    window.setTimeout(() => launch.click(), 50);
  }
  return {
    shadows: () => screen.querySelector<HTMLInputElement>('.start-shadows')!.checked,
  };
}
