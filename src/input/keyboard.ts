// Keyboard → a move direction for the simulation.
// W / Up = away from the camera (-Z), S / Down = toward it (+Z),
// A / Left = -X, D / Right = +X. The touch joystick (M7) will produce the same shape.

export interface MoveVector {
  x: number;
  z: number;
}

export interface KeyboardInput {
  getMove(): MoveVector;
  onKeyPress(code: string, handler: () => void): void;
}

export function createKeyboardInput(target: Window = window): KeyboardInput {
  const down = new Set<string>();
  const handlers = new Map<string, () => void>();

  target.addEventListener('keydown', (e) => {
    if (e.repeat) return;
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
    onKeyPress(code, handler) {
      handlers.set(code, handler);
    },
  };
}
