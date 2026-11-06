import { TILE } from "@/game/constants";
import { LADDER, ONEWAY, SOLID, type Stage } from "@/game/stage";
import type { Body } from "@/game/types";

export function cell(stage: Stage, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= stage.w || ty >= stage.h) return SOLID;
  return stage.tiles[ty * stage.w + tx] ?? SOLID;
}

export function isSolid(v: number): boolean {
  return v === SOLID;
}

export function solidPoint(stage: Stage, x: number, y: number): boolean {
  return isSolid(cell(stage, Math.floor(x / TILE), Math.floor(y / TILE)));
}

export function supportPoint(stage: Stage, x: number, y: number): boolean {
  const v = cell(stage, Math.floor(x / TILE), Math.floor(y / TILE));
  return v === SOLID || v === ONEWAY;
}

export function onLadder(stage: Stage, body: Body): boolean {
  const tx = Math.floor((body.x + body.w / 2) / TILE);
  const y0 = Math.floor((body.y + 4) / TILE);
  const y1 = Math.floor((body.y + body.h - 2) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    if (cell(stage, tx, ty) === LADDER) return true;
  }
  return false;
}

export type MoveResult = { grounded: boolean; hitWall: boolean };

/**
 * Integrate one axis at a time. Horizontal sensors are inset so flat floors
 * don't snag on tile seams; one-ways only catch a body falling onto them.
 */
export function moveBody(
  body: Body,
  dt: number,
  stage: Stage,
  opts: { oneway: boolean; stepUp: number; drop: boolean },
): MoveResult {
  let hitWall = false;
  const prevX = body.x;
  body.x += body.vx * dt;

  for (let iter = 0; iter < 3; iter++) {
    const y0 = body.y + 6;
    const y1 = body.y + body.h - 2;
    if (y1 <= y0) break;
    const tx0 = Math.floor(body.x / TILE);
    const tx1 = Math.floor((body.x + body.w - 0.01) / TILE);
    const ty0 = Math.floor(y0 / TILE);
    const ty1 = Math.floor((y1 - 0.01) / TILE);
    let fixed = false;
    let stepped = false;
    for (let ty = ty0; ty <= ty1 && !fixed; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isSolid(cell(stage, tx, ty))) continue;
        const tileTop = ty * TILE;
        const feet = body.y + body.h;
        if (!stepped && feet > tileTop && feet - tileTop <= opts.stepUp && body.vy >= 0) {
          body.y -= feet - tileTop;
          stepped = true;
          continue;
        }
        const left = tx * TILE;
        const right = (tx + 1) * TILE;
        if (prevX + body.w <= left + 0.5) {
          body.x = left - body.w - 0.01;
        } else if (prevX >= right - 0.5) {
          body.x = right + 0.01;
        } else {
          const pushL = body.x + body.w - left;
          const pushR = right - body.x;
          body.x += pushL < pushR ? -pushL - 0.01 : pushR + 0.01;
        }
        body.vx = 0;
        hitWall = true;
        fixed = true;
        break;
      }
    }
    if (!fixed) break;
  }

  const prevY = body.y;
  body.y += body.vy * dt;
  let grounded = false;

  for (let iter = 0; iter < 3; iter++) {
    const x0 = body.x + 2;
    const x1 = body.x + body.w - 2;
    const ty0 = Math.floor(body.y / TILE);
    const ty1 = Math.floor((body.y + body.h - 0.01) / TILE);
    const tx0 = Math.floor(x0 / TILE);
    const tx1 = Math.floor((x1 - 0.01) / TILE);
    let fixed = false;
    for (let ty = ty0; ty <= ty1 && !fixed; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const v = cell(stage, tx, ty);
        const top = ty * TILE;
        const bottom = (ty + 1) * TILE;
        if (isSolid(v)) {
          if (prevY + body.h <= top + 0.6) {
            body.y = top - body.h - 0.01;
            body.vy = 0;
            grounded = true;
          } else if (prevY >= bottom - 0.6) {
            body.y = bottom + 0.01;
            if (body.vy < 0) body.vy = 0;
          } else if (body.vy >= 0) {
            body.y = top - body.h - 0.01;
            body.vy = 0;
            grounded = true;
          } else {
            body.y = bottom + 0.01;
            body.vy = 0;
          }
          fixed = true;
          break;
        }
        if (
          opts.oneway &&
          !opts.drop &&
          v === ONEWAY &&
          body.vy >= 0 &&
          prevY + body.h <= top + 1
        ) {
          body.y = top - body.h - 0.01;
          body.vy = 0;
          grounded = true;
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) break;
  }

  if (!grounded && body.vy >= 0) {
    const y = body.y + body.h + 0.6;
    const xs = [body.x + 3, body.x + body.w / 2, body.x + body.w - 3];
    if (xs.some((x) => supportPoint(stage, x, y))) grounded = true;
  }

  return { grounded, hitWall };
}

export function aabb(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function blocked(
  stage: Stage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidPoint(stage, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
  }
  return false;
}
