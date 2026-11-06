export type WeaponId = "pistol" | "smg" | "shotgun" | "grenade";

export type PickupKind = "health" | "pistol" | "smg" | "shells" | "grenade";

export type Mode = "menu" | "play" | "paused" | "clear";

export type TileKind = 0 | 1 | 2 | 3;

export type Actions = {
  moveX: number;
  aimX: number;
  aimY: number;
  jump: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  fire: boolean;
  firePressed: boolean;
  nextWeapon: boolean;
  prevWeapon: boolean;
  slot: number;
  pausePressed: boolean;
  confirmPressed: boolean;
};

export type Body = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
};

export type Actor = Body & {
  facing: 1 | -1;
  grounded: boolean;
};

export type JoyVisual = {
  active: boolean;
  ox: number;
  oy: number;
  kx: number;
  ky: number;
};
