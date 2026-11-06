import type { Actions, PickupKind, WeaponId } from "@/game/types";

/** World tile. Player height / VIEW_H ≈ 1/6.15 of the screen — the zoom. */
export const TILE = 16;
export const VIEW_H = 246;

export const PLAYER_W = 16;
export const PLAYER_H = 40;
export const ENEMY_W = 28;
export const ENEMY_H = 30;
export const MUTANT_W = 24;
export const MUTANT_H = 52;
export const MUTANT2_W = 40;
export const MUTANT2_H = 34;
export const PICKUP = 14;

export const MOVE_SPEED = 126;
export const ACCEL_G = 2400;
export const ACCEL_A = 1500;
export const FRICTION = 3200;

/** Full hop ≈ 68px: clears a 4-tile step in the tall room, bonks tunnel ceilings. */
export const GRAV_RISE = 1150;
export const GRAV_FALL = 2400;
export const GRAV_APEX = 480;
export const JUMP_V = -396;
export const TERM_V = 560;
export const COYOTE = 0.11;
export const JUMP_BUFFER = 0.13;
export const CLIMB = 100;

export const STEP = 1 / 60;

export type WeaponDef = {
  id: WeaponId;
  name: string;
  short: string;
  rate: number;
  auto: boolean;
  speed: number;
  damage: number;
  pellets: number;
  spread: number;
  life: number;
  kind: "bullet" | "grenade";
  startAmmo: number;
  infinite: boolean;
};

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: "pistol",
    name: "9mm",
    short: "PIS",
    rate: 0.22,
    auto: false,
    speed: 560,
    damage: 1,
    pellets: 1,
    spread: 0,
    life: 0.5,
    kind: "bullet",
    startAmmo: 10,
    infinite: false,
  },
  {
    id: "smg",
    name: "SMG",
    short: "SMG",
    rate: 0.07,
    auto: true,
    speed: 620,
    damage: 1,
    pellets: 1,
    spread: 0.055,
    life: 0.42,
    kind: "bullet",
    startAmmo: 36,
    infinite: false,
  },
  {
    id: "shotgun",
    name: "Shotgun",
    short: "SCT",
    rate: 0.55,
    auto: false,
    speed: 500,
    damage: 1,
    pellets: 6,
    spread: 0.26,
    life: 0.28,
    kind: "bullet",
    startAmmo: 8,
    infinite: false,
  },
  {
    id: "grenade",
    name: "Grenades",
    short: "CHG",
    rate: 0.72,
    auto: false,
    speed: 290,
    damage: 5,
    pellets: 1,
    spread: 0,
    life: 0.95,
    kind: "grenade",
    startAmmo: 3,
    infinite: false,
  },
];

export const AMMO_PACK: Record<Exclude<PickupKind, "health">, number> = {
  pistol: 12,
  smg: 30,
  shells: 8,
  grenade: 3,
};

export const AMMO_NAME: Record<Exclude<PickupKind, "health">, string> = {
  pistol: "9mm",
  smg: "SMG",
  shells: "Shotgun",
  grenade: "Grenades",
};

export const EMPTY_ACTIONS: Actions = {
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
