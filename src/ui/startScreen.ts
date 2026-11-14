import type { GameAudio } from '../audio/gameAudio';

export interface LaunchOptions {
  players: number;
}

// Artwork and hit targets share one 16:9 coordinate system, including when resized.
export function createStartScreen(onStart: (options: LaunchOptions) => void, audio: GameAudio) {
  const screen = document.createElement('main');
  screen.className = 'start-screen';
  screen.setAttribute('aria-label', 'Disastronauts starting page');
  screen.innerHTML = `
    <div class="start-artboard">
      <img class="start-art" src="${import.meta.env.BASE_URL}ui/starting-page-launch-bg.png" alt="Disastronauts: a cozy illustrated Mars outpost under a starry sky, with an astronaut and a rocket ready for launch." draggable="false">
      <button class="start-settings art-hit" aria-label="Settings and controls"></button>
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
    <dialog class="start-help">
      <button class="settings-close" aria-label="Close settings">×</button>
      <h2>Mission settings</h2>
      <p><strong>Players</strong> includes you and up to three computer rivals. After a 10-second countdown you get 5 minutes: the highest <strong>Colony Score</strong> wins!</p>
      <p>Move with <strong>WASD / arrow keys</strong>. Nearby supplies collect automatically. Return to your base to unload.</p>
      <p><strong>C</strong> changes the camera. <strong>P</strong> changes power priority. <strong>Space</strong> calls Earth for a supply drop.</p>
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
  click('.start-settings', () => { syncAudio(); dialog.showModal(); });
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
      screen.remove();
    };
    launch.addEventListener('animationend', event => {
      if (event.target === launch) finish();
    });
    // Also finish when animations are disabled or the tab was backgrounded.
    const fallback = window.setTimeout(finish, reducedMotion ? 250 : 1450);
  });
  return {
    shadows: () => screen.querySelector<HTMLInputElement>('.start-shadows')!.checked,
  };
}
