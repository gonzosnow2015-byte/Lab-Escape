import type { Actions, JoyVisual } from "@/game/types";

const GAME_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "KeyZ",
  "KeyJ",
  "KeyK",
  "KeyL",
  "KeyQ",
  "KeyE",
  "KeyP",
  "Space",
  "Enter",
  "Escape",
  "ControlLeft",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
]);

type Held = {
  jump: boolean;
  fire: boolean;
  next: boolean;
  prev: boolean;
  pause: boolean;
  confirm: boolean;
  slots: boolean[];
};

function radial(x: number, y: number, dz: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz || m === 0) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

function blankHeld(): Held {
  return {
    jump: false,
    fire: false,
    next: false,
    prev: false,
    pause: false,
    confirm: false,
    slots: [false, false, false, false],
  };
}

export class Input {
  actions: Actions = {
    moveX: 0,
    aimX: 0,
    aimY: 0,
    jump: false,
    jumpPressed: false,
    jumpReleased: false,
    fire: false,
    firePressed: false,
    nextWeapon: false,
    prevWeapon: false,
    slot: -1,
    pausePressed: false,
    confirmPressed: false,
  };

  joy: JoyVisual = { active: false, ox: 0, oy: 0, kx: 0, ky: 0 };

  touch = { jump: false, fire: false, next: false };
  mouseFire = false;

  private keys = new Set<string>();
  private probe = new Set<string>();
  private probeSteer: number | null = null;
  private held: Held = blankHeld();
  private stickId: number | null = null;
  private originX = 0;
  private originY = 0;
  private maxR = 64;
  private bound = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.endStick();
    this.touch.jump = false;
    this.touch.fire = false;
    this.touch.next = false;
  };

  attach(): void {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;
    window.addEventListener("keydown", this.onKeyDown, { capture: true });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
  }

  detach(): void {
    if (!this.bound || typeof window === "undefined") return;
    this.bound = false;
    window.removeEventListener("keydown", this.onKeyDown, { capture: true });
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
  }

  /** QA probe: these codes stay held until the next call. `[]` clears. */
  setProbeKeys(codes: string[]): void {
    this.probe = new Set(codes);
  }

  /** Vehicle-style steer. Positive steers left (screen-left / -X here). */
  setProbeSteer(v: number | null): void {
    this.probeSteer = v;
  }

  pointerDown(id: number, x: number, y: number, width: number): void {
    if (this.stickId !== null) return;
    if (x > width * 0.52) return;
    this.stickId = id;
    this.originX = x;
    this.originY = y;
    this.joy = { active: true, ox: x, oy: y, kx: x, ky: y };
  }

  pointerMove(id: number, x: number, y: number): void {
    if (id !== this.stickId) return;
    const dx = x - this.originX;
    const dy = y - this.originY;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(this.maxR, mag);
    this.joy.kx = this.originX + (dx / mag) * clamped;
    this.joy.ky = this.originY + (dy / mag) * clamped;
  }

  pointerUp(id: number): void {
    if (id === this.stickId) this.endStick();
  }

  private endStick(): void {
    this.stickId = null;
    this.joy.active = false;
  }

  private down(code: string): boolean {
    return this.keys.has(code) || this.probe.has(code);
  }

  poll(): void {
    let moveX = 0;
    let aimX = 0;
    let aimY = 0;

    if (this.down("KeyA") || this.down("ArrowLeft")) {
      moveX -= 1;
      aimX -= 1;
    }
    if (this.down("KeyD") || this.down("ArrowRight")) {
      moveX += 1;
      aimX += 1;
    }
    if (this.down("KeyW") || this.down("ArrowUp")) aimY -= 1;
    if (this.down("KeyS") || this.down("ArrowDown")) aimY += 1;

    let jump = this.down("Space") || this.down("KeyZ");
    let fire = this.down("KeyJ") || this.down("KeyK") || this.down("KeyL") || this.down("ControlLeft");
    let next = this.down("KeyE");
    let prev = this.down("KeyQ");
    let pause = this.down("Escape") || this.down("KeyP");
    const confirm = this.down("Enter");
    const slots = [1, 2, 3, 4].map((n) => this.down(`Digit${n}`));

    if (this.probeSteer !== null) moveX = -this.probeSteer;

    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
    const pad = pads ? Array.from(pads).find((p) => p && p.connected) : undefined;
    if (pad) {
      const stick = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.18);
      moveX += stick.x;
      aimX += stick.x;
      aimY += stick.y;
      const look = radial(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.28);
      if (Math.hypot(look.x, look.y) > 0.01) {
        aimX = look.x;
        aimY = look.y;
      }
      const pressed = (i: number) => Boolean(pad.buttons[i]?.pressed);
      const val = (i: number) => pad.buttons[i]?.value ?? 0;
      if (pressed(0)) jump = true;
      if (pressed(1) || pressed(2) || val(7) > 0.45) fire = true;
      if (pressed(5)) next = true;
      if (pressed(4)) prev = true;
      if (pressed(12)) aimY -= 1;
      if (pressed(13)) aimY += 1;
      if (pressed(14)) {
        moveX -= 1;
        aimX -= 1;
      }
      if (pressed(15)) {
        moveX += 1;
        aimX += 1;
      }
      if (pressed(9) || pressed(8)) pause = true;
    }

    if (this.joy.active) {
      const dx = (this.joy.kx - this.joy.ox) / this.maxR;
      const dy = (this.joy.ky - this.joy.oy) / this.maxR;
      const stick = radial(dx, dy, 0.16);
      moveX = stick.x;
      aimX = stick.x;
      aimY = stick.y;
    }

    if (this.touch.jump) jump = true;
    if (this.touch.fire || this.mouseFire) fire = true;
    if (this.touch.next) next = true;

    this.apply({ moveX, aimX, aimY, jump, fire, next, prev, pause, confirm, slots });
  }

  private apply(raw: {
    moveX: number;
    aimX: number;
    aimY: number;
    jump: boolean;
    fire: boolean;
    next: boolean;
    prev: boolean;
    pause: boolean;
    confirm: boolean;
    slots: boolean[];
  }): void {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    let slot = -1;
    for (let i = 0; i < 4; i++) {
      if (raw.slots[i] && !this.held.slots[i]) slot = i;
    }
    const prev = this.actions;
    this.actions = {
      moveX: clamp(raw.moveX),
      aimX: clamp(raw.aimX),
      aimY: clamp(raw.aimY),
      jump: raw.jump,
      jumpPressed: (raw.jump && !this.held.jump) || prev.jumpPressed,
      jumpReleased: (!raw.jump && this.held.jump) || prev.jumpReleased,
      fire: raw.fire,
      firePressed: (raw.fire && !this.held.fire) || prev.firePressed,
      nextWeapon: (raw.next && !this.held.next) || prev.nextWeapon,
      prevWeapon: (raw.prev && !this.held.prev) || prev.prevWeapon,
      slot: slot >= 0 ? slot : prev.slot,
      pausePressed: (raw.pause && !this.held.pause) || prev.pausePressed,
      confirmPressed: (raw.confirm && !this.held.confirm) || prev.confirmPressed,
    };
    this.held = {
      jump: raw.jump,
      fire: raw.fire,
      next: raw.next,
      prev: raw.prev,
      pause: raw.pause,
      confirm: raw.confirm,
      slots: raw.slots.slice(),
    };
  }

  consumeUi(): void {
    this.actions.pausePressed = false;
    this.actions.confirmPressed = false;
  }

  consumeEdges(): void {
    this.actions = {
      ...this.actions,
      jumpPressed: false,
      jumpReleased: false,
      firePressed: false,
      nextWeapon: false,
      prevWeapon: false,
      slot: -1,
      pausePressed: false,
      confirmPressed: false,
    };
  }
}
