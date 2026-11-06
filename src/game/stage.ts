import {
  ENEMY_H,
  ENEMY_W,
  MUTANT_H,
  MUTANT_W,
  PICKUP,
  PLAYER_H,
  PLAYER_W,
  TILE,
} from "@/game/constants";
import type { PickupKind } from "@/game/types";

export const SOLID = 1;
export const ONEWAY = 2;
export const LADDER = 3;

export type Marker = { x: number; y: number };
export type StageEnemy = Marker & { kind?: "mutant" };

export type Stage = {
  id: string;
  name: string;
  blurb: string;
  w: number;
  h: number;
  tiles: Uint8Array;
  spawn: Marker;
  checkpoints: Marker[];
  enemies: StageEnemy[];
  pickups: { x: number; y: number; kind: PickupKind }[];
  exit: { x: number; y: number; w: number; h: number };
};

const W = 72;
const H = 28;

function place(col: number, floorRow: number, w: number, h: number): Marker {
  return {
    x: col * TILE + (TILE - w) / 2,
    y: floorRow * TILE - h,
  };
}

function buildGrid(): Uint8Array {
  const grid = new Uint8Array(W * H).fill(SOLID);
  const carve = (c0: number, r0: number, c1: number, r1: number) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c <= 0 || r <= 0 || c >= W - 1 || r >= H - 1) continue;
        grid[r * W + c] = 0;
      }
    }
  };
  const solidAt = (c: number, r: number) => {
    if (c <= 0 || r <= 0 || c >= W - 1 || r >= H - 1) return;
    grid[r * W + c] = SOLID;
  };
  const ladder = (c0: number, c1: number, r0: number, r1: number) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * W + c;
        if (grid[i] !== SOLID) grid[i] = LADDER;
      }
    }
  };
  const oneway = (c0: number, c1: number, r: number) => {
    for (let c = c0; c <= c1; c++) {
      const i = r * W + c;
      if (grid[i] !== SOLID) grid[i] = ONEWAY;
    }
  };

  // Spawn tunnel ends in the drop. 4 tiles of air, almost no jump room.
  carve(2, 2, 21, 5);
  // Three-tile service drop into the mid gallery.
  carve(19, 6, 21, 10);
  // Mid gallery.
  carve(2, 10, 40, 13);
  // Combat hall, ceiling raised so a full hop fits.
  carve(28, 7, 54, 13);
  // Upper pipe (grenades) and the climb into it.
  carve(52, 2, 68, 5);
  carve(52, 6, 53, 8);
  // Drop from the hall into the escape duct.
  carve(47, 14, 49, 20);
  // Escape duct.
  carve(8, 20, 66, 23);
  // Maintenance crawl between mid and the duct.
  carve(4, 15, 16, 17);
  carve(8, 14, 9, 20);

  // Low cover. One tile tall — hop them, don't walk through.
  solidAt(36, 23);
  solidAt(37, 23);
  solidAt(56, 23);
  solidAt(57, 23);

  ladder(19, 21, 2, 13);
  ladder(8, 9, 12, 23);
  ladder(47, 49, 8, 23);
  ladder(52, 53, 2, 12);
  oneway(34, 44, 10);

  return grid;
}

function solidAtPoint(tiles: Uint8Array, x: number, y: number): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
  return tiles[ty * W + tx] === SOLID;
}

function buried(tiles: Uint8Array, x: number, y: number, w: number, h: number): boolean {
  const pts: [number, number][] = [
    [x + 1, y + 1],
    [x + w - 1, y + 1],
    [x + 1, y + h - 1],
    [x + w - 1, y + h - 1],
    [x + w / 2, y + h / 2],
  ];
  return pts.some(([px, py]) => solidAtPoint(tiles, px, py));
}

export function createShaft01(): Stage {
  const tiles = buildGrid();
  const spawn = place(4, 6, PLAYER_W, PLAYER_H);
  const stage: Stage = {
    id: "shaft-01",
    name: "Test shaft 01",
    blurb: "Lower works. Keep your head down.",
    w: W,
    h: H,
    tiles,
    spawn,
    checkpoints: [
      spawn,
      place(14, 14, PLAYER_W, PLAYER_H),
      place(30, 14, PLAYER_W, PLAYER_H),
      place(18, 24, PLAYER_W, PLAYER_H),
    ],
    enemies: [
      place(16, 6, ENEMY_W, ENEMY_H),
      place(5, 14, ENEMY_W, ENEMY_H),
      place(40, 14, ENEMY_W, ENEMY_H),
      place(38, 10, ENEMY_W, ENEMY_H),
      place(30, 24, ENEMY_W, ENEMY_H),
      place(50, 24, ENEMY_W, ENEMY_H),
      place(60, 6, ENEMY_W, ENEMY_H),
      { ...place(26, 14, MUTANT_W, MUTANT_H), kind: "mutant" },
    ],
    pickups: [
      { ...place(10, 6, PICKUP, PICKUP), kind: "pistol" },
      { ...place(4, 14, PICKUP, PICKUP), kind: "health" },
      { ...place(32, 14, PICKUP, PICKUP), kind: "smg" },
      { ...place(13, 18, PICKUP, PICKUP), kind: "shells" },
      { ...place(66, 6, PICKUP, PICKUP), kind: "grenade" },
      { ...place(58, 24, PICKUP, PICKUP), kind: "health" },
    ],
    exit: { x: 62 * TILE, y: 20 * TILE, w: 4 * TILE, h: 4 * TILE },
  };

  const problems: string[] = [];
  if (buried(tiles, spawn.x, spawn.y, PLAYER_W, PLAYER_H)) problems.push("spawn");
  stage.enemies.forEach((e, i) => {
    const w = e.kind === "mutant" ? MUTANT_W : ENEMY_W;
    const h = e.kind === "mutant" ? MUTANT_H : ENEMY_H;
    if (buried(tiles, e.x, e.y, w, h)) problems.push(`enemy ${i}`);
  });
  stage.pickups.forEach((p, i) => {
    if (buried(tiles, p.x, p.y, PICKUP, PICKUP)) problems.push(`pickup ${i}`);
  });
  const ex = stage.exit.x + stage.exit.w / 2;
  const ey = stage.exit.y + stage.exit.h / 2;
  if (solidAtPoint(tiles, ex, ey)) problems.push("exit");
  if (problems.length) {
    throw new Error(`Shaft 01 markers inside solid tiles: ${problems.join(", ")}`);
  }
  return stage;
}

export const STAGES: Stage[] = [createShaft01()];

export function stageById(id: string): Stage {
  const found = STAGES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown stage ${id}`);
  return found;
}
