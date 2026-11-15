// Keyboard → a move direction for the simulation.
// W / Up = away from the camera (-Z), S / Down = toward it (+Z),
// A / Left = -X, D / Right = +X. The touch joystick (M7) will produce the same shape.

export interface MoveVector {
  x: number;
  z: number;
}

// "Turn & walk" keys for the camera-behind view: A/D turn, W/S walk.
export interface TurnWalk {
  turn: number; // +1 = right
  forward: number; // +1 = forward, -1 = back up
}

export interface KeyboardInput {
  getMove(): MoveVector;
  getTurnWalk(): TurnWalk;
  onKeyPress(code: string, handler: () => void): void;
  isDown(code: string): boolean; // held right now (e.g. E to work on a mini task)
}

export function createKeyboardInput(target: Window = window): KeyboardInput {
  const down = new Set<string>();
  const handlers = new Map<string, () => void>();

  target.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // Preserve form editing and button activation without trapping movement
    // after clicking an in-game control such as the sound toggle.
    const focused = e.target as HTMLElement | null;
    if (focused?.closest?.('input, select, textarea, dialog')) return;
    if (focused?.closest?.('button') && (e.code === 'Space' || e.code === 'Enter')) return;
    down.add(e.code);
    handlers.get(e.code)?.();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); // don't scroll the page
  });
  target.addEventListener('keyup', (e) => down.delete(e.code));
  // Release everything if the window loses focus, so the rover doesn't keep driving.
  target.addEventListener('blur', () => down.clear());

  const pressed = (...codes: string[]) => codes.some((c) => down.has(c));

  return {
    getMove() {
      const x = (pressed('KeyD', 'ArrowRight') ? 1 : 0) - (pressed('KeyA', 'ArrowLeft') ? 1 : 0);
      const z = (pressed('KeyS', 'ArrowDown') ? 1 : 0) - (pressed('KeyW', 'ArrowUp') ? 1 : 0);
      return { x, z };
    },
    getTurnWalk() {
      const turn = (pressed('KeyD', 'ArrowRight') ? 1 : 0) - (pressed('KeyA', 'ArrowLeft') ? 1 : 0);
      const forward = (pressed('KeyW', 'ArrowUp') ? 1 : 0) - (pressed('KeyS', 'ArrowDown') ? 1 : 0);
      return { turn, forward };
    },
    onKeyPress(code, handler) {
      handlers.set(code, handler);
    },
    isDown(code) {
      return down.has(code);
    },
  };
}
