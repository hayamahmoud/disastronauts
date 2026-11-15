import { BALANCE } from '../config/balance';
import type { GameEvent } from '../core/events';

// Original synthesized audio: no downloads, external music, or simulation changes.
export function createGameAudio(localPlayerId: string) {
  let context: AudioContext | undefined;
  let master: GainNode;
  let music: GainNode;
  let effects: GainNode;
  let musicLevel: GainNode;
  const listeners = new Set<() => void>();
  function loadVolume(key: string) {
    try {
      const value = Number(localStorage.getItem(key) ?? 1);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    } catch { return 1; }
  }
  let musicVolume = loadVolume('disastronauts.musicVolume');
  let effectsVolume = loadVolume('disastronauts.effectsVolume');
  let muted = false;
  try { muted = localStorage.getItem('disastronauts.muted') === 'true'; } catch { /* Storage is optional. */ }
  let timer: number | undefined;
  let nextNote = 0;
  let noteIndex = 0;
  let inGame = false;
  let lastPickup = -Infinity;
  let lastWarning = -Infinity;

  const toggle = document.createElement('button');
  toggle.className = 'sound-toggle';
  toggle.type = 'button';
  document.body.append(toggle);
  function updateToggle() {
    toggle.textContent = muted ? '♪ Sound off' : '♪ Sound on';
    toggle.setAttribute('aria-label', muted ? 'Unmute music and sound effects' : 'Mute music and sound effects');
    toggle.setAttribute('aria-pressed', String(muted));
    toggle.title = 'Music starts after your first click or key press.';
  }
  updateToggle();

  function tone(frequency: number, time: number, duration: number, volume: number, type: OscillatorType = 'sine', bus = effects, endFrequency = frequency) {
    if (!context) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + Math.min(0.025, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  // A gentle pentatonic melody over slowly changing bass notes.
  function scheduleMusic() {
    if (!context || context.state !== 'running' || muted || document.hidden) return;
    const melody = [0, 7, 12, 16, 14, 12, 7, 4, 0, 7, 14, 19, 16, 12, 7, 4];
    const roots = [130.81, 110, 87.31, 98];
    if (nextNote < context.currentTime) nextNote = context.currentTime + 0.04;
    while (nextNote < context.currentTime + 0.5) {
      const root = roots[Math.floor(noteIndex / 16) % roots.length];
      const semitones = melody[noteIndex % melody.length];
      tone(root * 2 * Math.pow(2, semitones / 12), nextNote, 1.1, inGame ? 0.035 : 0.05, 'sine', music);
      if (noteIndex % 4 === 0) tone(root / 2, nextNote, 2.3, 0.07, 'sine', music);
      if (noteIndex % 8 === 0) tone(root * 1.5, nextNote, 2.8, 0.025, 'triangle', music);
      noteIndex++;
      nextNote += 0.42;
    }
  }

  function unlock() {
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        music = context.createGain();
        musicLevel = context.createGain();
        musicLevel.gain.value = musicVolume;
        effects = context.createGain();
        master.gain.value = muted ? 0 : 0.55;
        music.gain.value = 0.65;
        effects.gain.value = 0.8 * effectsVolume;
        // Keep layered sounds and launch noise from clipping.
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 8;
        music.connect(musicLevel).connect(master); effects.connect(master);
        master.connect(limiter).connect(context.destination);
        timer = window.setInterval(scheduleMusic, 200);
      }
      if (context.state === 'suspended') void context.resume().then(scheduleMusic).catch(() => {});
      else scheduleMusic();
    } catch { /* Audio support or autoplay restrictions never block the game. */ }
  }
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.hidden) {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      void context.suspend().catch(() => {});
    } else {
      if (timer === undefined) timer = window.setInterval(scheduleMusic, 200);
      unlock();
    }
  });
  function setMuted(value: boolean) {
    muted = value;
    unlock();
    if (context) master.gain.setTargetAtTime(muted ? 0 : 0.55, context.currentTime, 0.025);
    try { localStorage.setItem('disastronauts.muted', String(muted)); } catch { /* Optional. */ }
    updateToggle();
    listeners.forEach(listener => listener());
  }
  toggle.onclick = () => setMuted(!muted);

  function click() {
    unlock();
    if (!context || muted) return;
    tone(540, context.currentTime, 0.075, 0.09, 'sine', effects, 800);
  }
  function hover() {
    // Hover alone cannot unlock audio under browser autoplay rules.
    if (!context || context.state !== 'running' || muted) return;
    tone(330, context.currentTime, 0.14, 0.045, 'triangle', effects, 480);
  }
  function launch(duration: number) {
    unlock();
    if (!context || muted) return;
    const start = context.currentTime;
    // Filtered noise swells into a warm engine roar, then trails away.
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(180, start);
    filter.frequency.exponentialRampToValueAtTime(2400, start + duration * 0.65);
    filter.frequency.exponentialRampToValueAtTime(250, start + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.6, start + duration * 0.35);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    const pan = context.createStereoPanner();
    pan.pan.setValueAtTime(-0.2, start);
    pan.pan.linearRampToValueAtTime(1, start + duration);
    source.connect(filter).connect(envelope).connect(pan).connect(effects);
    source.start(start); source.stop(start + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); pan.disconnect(); };
    tone(55, start, duration, 0.2, 'triangle', effects, 140);
    // Dip the music beneath takeoff, then bring it back gently.
    music.gain.cancelScheduledValues(start);
    music.gain.setTargetAtTime(0.15, start, 0.05);
    music.gain.setTargetAtTime(0.65, start + duration, 0.4);
  }

  return {
    click, hover, launch,
    getSettings: () => ({ muted, musicVolume, effectsVolume }),
    setMuted,
    setVolume(kind: 'music' | 'effects', value: number) {
      if (!Number.isFinite(value)) return;
      const volume = Math.max(0, Math.min(1, value));
      if (kind === 'music') musicVolume = volume;
      else effectsVolume = volume;
      unlock();
      if (context) {
        const gain = kind === 'music' ? musicLevel : effects;
        gain.gain.setTargetAtTime(volume * (kind === 'music' ? 1 : 0.8), context.currentTime, 0.025);
      }
      try { localStorage.setItem(`disastronauts.${kind === 'music' ? 'musicVolume' : 'effectsVolume'}`, String(volume)); } catch { /* Optional. */ }
      listeners.forEach(listener => listener());
    },
    onSettingsChange(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    enterGame() { inGame = true; },
    // A friendly two-note "ding" (the tutorial plays it when you finish a step).
    chime() {
      if (!context || context.state !== 'running' || muted) return;
      const now = context.currentTime;
      [784, 1175].forEach((note, i) => tone(note, now + i * 0.1, 0.3, 0.06, 'triangle'));
    },
    // `combo` = how many pickups in a row you've grabbed quickly (see ui/combo.ts):
    // each one in a row plays a slightly higher note.
    update(events: GameEvent[], localBaseId: string, combo = 1) {
      if (!context || context.state !== 'running' || muted) return;
      const now = context.currentTime;
      for (const event of events) {
        // Disasters hit everyone, so they always play.
        if (event.type === 'DisasterWarning') {
          [880, 660, 880, 660].forEach((note, i) => tone(note, now + i * 0.2, 0.16, 0.06, 'square'));
          continue;
        }
        if (event.type === 'DisasterStarted') {
          tone(110, now, 1.4, 0.16, 'sawtooth', effects, 55); // low rumble
          continue;
        }
        // Round flow: countdown beeps, a GO chord, and a fanfare at the end.
        if (event.type === 'RoundCountdown') {
          if (event.secondsLeft <= 3) tone(660, now, 0.15, 0.08, 'square');
          continue;
        }
        if (event.type === 'RoundStarted') {
          [523, 659, 784].forEach((note) => tone(note, now, 0.5, 0.06, 'square'));
          continue;
        }
        if (event.type === 'RoundEndingSoon') {
          [988, 784].forEach((note, i) => tone(note, now + i * 0.18, 0.2, 0.07, 'triangle'));
          continue;
        }
        if (event.type === 'RoundEnded') {
          [523, 659, 784, 1047, 784, 1047].forEach((note, i) => tone(note, now + i * 0.13, i === 5 ? 0.8 : 0.22, 0.07));
          continue;
        }
        const mine = 'playerId' in event ? event.playerId === localPlayerId
          : 'baseId' in event && event.baseId === localBaseId;
        if (!mine) continue;
        if (event.type === 'PickupCollected' && now - lastPickup > 0.09) {
          const J = BALANCE.juice;
          const rise = Math.pow(2, (Math.min(combo, J.comboPitchMax) - 1) * J.comboPitchStep);
          tone(660 * rise, now, 0.12, 0.065, 'sine', effects, 990 * rise); lastPickup = now;
        } else if (event.type === 'TaskStarted') {
          tone(140, now, 0.25, 0.05, 'sawtooth', effects, 190); // tool whirrs to life
        } else if (event.type === 'TaskCompleted') {
          [659, 784, 988, 1319].forEach((note, i) => tone(note, now + i * 0.06, 0.22, 0.06)); // job done!
        } else if (event.type === 'CargoDeposited') {
          [392, 494, 587].forEach((note, i) => tone(note, now + i * 0.07, 0.24, 0.07));
        } else if (event.type === 'MissionEnded' && event.stars > 0) {
          // One rising note per star earned.
          [784, 988, 1175].slice(0, event.stars).forEach((note, i) => tone(note, now + i * 0.14, 0.4, 0.07));
        } else if (event.type === 'SupplyDropCalled') {
          [1200, 1500].forEach((note, i) => tone(note, now + i * 0.1, 0.08, 0.05, 'square')); // radio blips
        } else if (event.type === 'SupplyDropLanded') {
          tone(90, now, 0.3, 0.2, 'triangle', effects, 45); // thump
          [523, 784].forEach((note, i) => tone(note, now + 0.15 + i * 0.1, 0.3, 0.06));
        } else if (event.type === 'BaseWrecked') {
          [392, 330, 262, 196].forEach((note, i) => tone(note, now + i * 0.22, 0.4, 0.08, 'triangle'));
        } else if (event.type === 'SupplyDropDenied') {
          tone(220, now, 0.2, 0.07, 'triangle');
        } else if (event.type === 'BuildingBuilt' || event.type === 'CrewAdded' || event.type === 'WreckAbsorbed' || event.type === 'BaseRelaunched') {
          [523, 659, 784, 1047].forEach((note, i) => tone(note, now + i * 0.09, 0.35, 0.055));
        } else if (['CargoFull', 'PowerOut', 'LifeSupportEmpty', 'CrewSick', 'CrewLost'].includes(event.type) && now - lastWarning > 1) {
          tone(294, now, 0.18, 0.075, 'triangle');
          tone(220, now + 0.22, 0.25, 0.075, 'triangle'); lastWarning = now;
        }
      }
    },
  };
}

export type GameAudio = ReturnType<typeof createGameAudio>;
