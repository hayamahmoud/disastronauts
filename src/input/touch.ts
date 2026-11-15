// Touch controls (M7): an on-screen joystick for phones and tablets.
// It produces the same shapes as the keyboard (MoveVector / TurnWalk), so the
// game loop doesn't care where the input came from.
//
// The joystick only shows on touch screens: either the device says its main
// pointer is a finger, or the player touches the screen at least once.
// On Roblox this is replaced by Roblox's built-in thumbstick.

import { BALANCE } from '../config/balance';
import type { MoveVector, TurnWalk } from './keyboard';

export interface TouchInput {
  getMove(): MoveVector; // top view: push up = move up the screen
  getTurnWalk(): TurnWalk; // behind view: push up = walk, left/right = turn
  isActive(): boolean; // a finger is on the stick right now
}

// Adds `is-touch` to <body> on touch screens; CSS uses it to show the
// joystick and touch buttons and hide the keyboard hints.
export function watchTouchScreen(onChange?: () => void): void {
  const mark = () => {
    if (document.body.classList.contains('is-touch')) return;
    document.body.classList.add('is-touch');
    onChange?.();
  };
  if (window.matchMedia('(pointer: coarse)').matches) mark();
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') mark(); }, { capture: true });
  // Dev only: ?touch=1 forces touch mode so it can be tried with a mouse.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('touch') === '1') mark();
}

export function createTouchStick(parent: HTMLElement): TouchInput {
  const R = BALANCE.touch;
  const pad = document.createElement('div');
  pad.className = 'touch-stick';
  pad.setAttribute('aria-hidden', 'true'); // keyboard users have WASD
  const knob = document.createElement('div');
  knob.className = 'touch-stick-knob';
  pad.appendChild(knob);
  parent.appendChild(pad);

  let finger: number | null = null;
  let x = 0; // -1 (left) to 1 (right)
  let z = 0; // -1 (up) to 1 (down), like the keyboard's MoveVector

  function moveTo(clientX: number, clientY: number) {
    const r = pad.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R.stickRadiusPx) {
      dx = (dx / len) * R.stickRadiusPx;
      dy = (dy / len) * R.stickRadiusPx;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const amount = Math.min(1, len / R.stickRadiusPx);
    if (amount < R.deadZone) {
      x = z = 0;
      return;
    }
    x = dx / R.stickRadiusPx;
    z = dy / R.stickRadiusPx;
  }
  function release() {
    finger = null;
    x = z = 0;
    knob.style.transform = '';
    pad.classList.remove('is-held');
  }

  pad.addEventListener('pointerdown', (e) => {
    finger = e.pointerId;
    pad.setPointerCapture(e.pointerId); // keep steering even if the thumb slides off
    pad.classList.add('is-held');
    moveTo(e.clientX, e.clientY);
    e.preventDefault();
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === finger) moveTo(e.clientX, e.clientY);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    pad.addEventListener(type, (e) => { if (e.pointerId === finger) release(); });
  }
  pad.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menu on phones

  return {
    getMove: () => ({ x, z }),
    // Like W/S + A/D: push up to walk forward, sideways to turn.
    getTurnWalk: () => ({ turn: x, forward: -z }),
    isActive: () => finger !== null,
  };
}
