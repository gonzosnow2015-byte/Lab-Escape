import { PLAYER_W, TILE, VIEW_H } from "@/game/constants";
import { LADDER, ONEWAY, SOLID, type Stage } from "@/game/stage";
import { barrelPoint, type Game } from "@/game/sim";
import type { JoyVisual, PickupKind } from "@/game/types";
import brickUrl from "@/game/art/bg-brick.jpg";
import pipesUrl from "@/game/art/bg-pipes.jpg";
import panelsUrl from "@/game/art/bg-panels.jpg";
import ventsUrl from "@/game/art/bg-vents.jpg";
import platformUrl from "@/game/art/platform.png";
import floorUrl from "@/game/art/floor-concrete.png";
import ladderUrl from "@/game/art/ladder-rungs.png";
import medikitUrl from "@/game/art/pickup-kit.png";
import pistolUrl from "@/game/art/pickup-rounds.png";
import autoUrl from "@/game/art/pickup-mag.png";
import shellsUrl from "@/game/art/pickup-shells.png";
import grenadeUrl from "@/game/art/pickup-bomb.png";

const runUrls = import.meta.glob("./art/player/run-*.png", { eager: true, import: "default" }) as Record<string, string>;
const upUrls = import.meta.glob("./art/player/up-*.png", { eager: true, import: "default" }) as Record<string, string>;
const downUrls = import.meta.glob("./art/player/down-*.png", { eager: true, import: "default" }) as Record<string, string>;
import idleUrl from "@/game/art/player/idle.png";
import standUrl from "@/game/art/player/stand.png";
import aimUrl from "@/game/art/player/aim.png";
import climbUrl from "@/game/art/player/climb.png";
import climbUpUrl from "@/game/art/player/climb-up.png";
import ladLevelUrl from "@/game/art/player/lad-level.png";
import ladUpUrl from "@/game/art/player/lad-up.png";
import ladDownUrl from "@/game/art/player/lad-down.png";
import ladSkyUrl from "@/game/art/player/lad-sky.png";
import ladShootDownUrl from "@/game/art/player/lad-shoot-down.png";
import mutant0Url from "@/game/art/enemy/mutant-0.png";
import mutant1Url from "@/game/art/enemy/mutant-1.png";
import mutant2Url from "@/game/art/enemy/mutant-2.png";
import mutant3Url from "@/game/art/enemy/mutant-3.png";
import mutant4Url from "@/game/art/enemy/mutant-4.png";
import crawler0Url from "@/game/art/enemy/crawler-0.png";
import crawler1Url from "@/game/art/enemy/crawler-1.png";
import crawler2Url from "@/game/art/enemy/crawler-2.png";
import crawler3Url from "@/game/art/enemy/crawler-3.png";
import crawler4Url from "@/game/art/enemy/crawler-4.png";
import swipe0Url from "@/game/art/enemy/swipe-0.png";
import swipe1Url from "@/game/art/enemy/swipe-1.png";
import swipe2Url from "@/game/art/enemy/swipe-2.png";
import swipe3Url from "@/game/art/enemy/swipe-3.png";

const chunkUrls = import.meta.glob("./art/chunks/*.png", { eager: true, import: "default" }) as Record<string, string>;

const reduced =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function hash(x: number, y: number): number {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return (n ^ (n >> 16)) >>> 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** One full wall photo per panel. 8×12 tiles keeps the source aspect, and neighbors never match. */
const BG_CHUNK_X = 8;
const BG_CHUNK_Y = 12;
const LADDER_W = 14;

type ArtSet = {
  walls: HTMLImageElement[];
  platform: HTMLImageElement;
  floor: HTMLImageElement;
  ladder: HTMLImageElement;
  pickups: Record<PickupKind, HTMLImageElement>;
  player: {
    run: HTMLImageElement[];
    up: HTMLImageElement[];
    down: HTMLImageElement[];
    idle: HTMLImageElement;
    stand: HTMLImageElement;
    aim: HTMLImageElement;
    climb: HTMLImageElement;
    climbUp: HTMLImageElement;
    ladLevel: HTMLImageElement;
    ladUp: HTMLImageElement;
    ladDown: HTMLImageElement;
    ladSky: HTMLImageElement;
    ladShootDown: HTMLImageElement;
  };
  mutant: HTMLImageElement[];
  crawler: HTMLImageElement[];
  swipe: HTMLImageElement[];
  chunks: HTMLImageElement[];
};

let artSet: ArtSet | null = null;
const bgCache = new WeakMap<Stage, Uint8Array>();

function loadSet(mods: Record<string, string>): HTMLImageElement[] {
  return Object.keys(mods)
    .sort()
    .map((key) => loadImage(mods[key] ?? ""));
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

function getArt(): ArtSet {
  if (artSet) return artSet;
  artSet = {
    walls: [brickUrl, pipesUrl, panelsUrl, ventsUrl].map(loadImage),
    platform: loadImage(platformUrl),
    floor: loadImage(floorUrl),
    ladder: loadImage(ladderUrl),
    pickups: {
      health: loadImage(medikitUrl),
      pistol: loadImage(pistolUrl),
      smg: loadImage(autoUrl),
      shells: loadImage(shellsUrl),
      grenade: loadImage(grenadeUrl),
    },
    player: {
      run: loadSet(runUrls),
      up: loadSet(upUrls),
      down: loadSet(downUrls),
      idle: loadImage(idleUrl),
      stand: loadImage(standUrl),
      aim: loadImage(aimUrl),
      climb: loadImage(climbUrl),
      climbUp: loadImage(climbUpUrl),
      ladLevel: loadImage(ladLevelUrl),
      ladUp: loadImage(ladUpUrl),
      ladDown: loadImage(ladDownUrl),
      ladSky: loadImage(ladSkyUrl),
      ladShootDown: loadImage(ladShootDownUrl),
    },
    mutant: [mutant0Url, mutant1Url, mutant2Url, mutant3Url, mutant4Url].map(loadImage),
    crawler: [crawler0Url, crawler1Url, crawler2Url, crawler3Url, crawler4Url].map(loadImage),
    swipe: [swipe0Url, swipe1Url, swipe2Url, swipe3Url].map(loadImage),
    chunks: loadSet(chunkUrls),
  };
  return artSet;
}

function ready(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

function bgChoices(stage: Stage): Uint8Array {
  const cached = bgCache.get(stage);
  if (cached) return cached;
  const chunkW = Math.ceil(stage.w / BG_CHUNK_X);
  const chunkH = Math.ceil(stage.h / BG_CHUNK_Y);
  const chunks = new Uint8Array(chunkW * chunkH);
  for (let cy = 0; cy < chunkH; cy++) {
    for (let cx = 0; cx < chunkW; cx++) {
      const left = cx > 0 ? chunks[cy * chunkW + cx - 1] : -1;
      const up = cy > 0 ? chunks[(cy - 1) * chunkW + cx] : -1;
      let v = hash(cx, cy) % 4;
      if (v === left || v === up) {
        for (let k = 1; k <= 4; k++) {
          const n = (v + k) % 4;
          if (n !== left && n !== up) {
            v = n;
            break;
          }
        }
      }
      chunks[cy * chunkW + cx] = v;
    }
  }
  const out = new Uint8Array(stage.w * stage.h);
  for (let ty = 0; ty < stage.h; ty++) {
    for (let tx = 0; tx < stage.w; tx++) {
      const cx = Math.floor(tx / BG_CHUNK_X);
      const cy = Math.floor(ty / BG_CHUNK_Y);
      out[ty * stage.w + tx] = chunks[cy * chunkW + cx];
    }
  }
  bgCache.set(stage, out);
  return out;
}

export function draw(
  ctx: CanvasRenderingContext2D,
  game: Game,
  cssW: number,
  cssH: number,
  dpr: number,
  alpha: number,
  joy: JoyVisual,
): void {
  if (cssW < 2 || cssH < 2) return;
  const viewH = VIEW_H;
  const viewW = (VIEW_H * cssW) / cssH;
  const scale = cssH / viewH;
  const shakeMag = reduced ? 0 : game.shake;
  const shakeX = (Math.random() - 0.5) * shakeMag * 2;
  const shakeY = (Math.random() - 0.5) * shakeMag * 2;
  const camX = Math.round(game.cam.x + shakeX);
  const camY = Math.round(game.cam.y + shakeY);
  const t = game.time;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#07080b";
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#101218";
  for (let i = 0; i < 8; i++) {
    const y = ((i * 78 - camY * 0.22) % (cssH + 90)) - 40;
    ctx.fillRect(0, y, cssW, 14);
  }
  ctx.fillStyle = "#0c1218";
  for (let i = 0; i < 5; i++) {
    const x = ((i * 140 - camX * 0.15) % (cssW + 160)) - 50;
    ctx.fillRect(x, 0, 10, cssH);
  }

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(-camX, -camY);

  const stage = game.stage;
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const x1 = Math.min(stage.w - 1, Math.ceil((camX + viewW) / TILE) + 1);
  const y1 = Math.min(stage.h - 1, Math.ceil((camY + viewH) / TILE) + 1);
  const art = getArt();
  const wallsOn = art.walls.every(ready);
  const choice = wallsOn ? bgChoices(stage) : null;

  if (choice) drawBackdrop(ctx, stage, choice, x0, y0, x1, y1);

  ctx.imageSmoothingEnabled = false;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const v = stage.tiles[ty * stage.w + tx] ?? SOLID;
      if (v === SOLID) drawSolid(ctx, stage, tx, ty, t);
    }
  }
  ctx.imageSmoothingEnabled = true;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const v = stage.tiles[ty * stage.w + tx] ?? 0;
      if (v === LADDER) drawLadder(ctx, stage, tx, ty, x0);
      else if (v === ONEWAY) drawGrate(ctx, tx, ty);
    }
  }

  drawExit(ctx, stage, t);
  drawCheckpoints(ctx, game, t);

  for (const item of game.pickups) {
    if (item.taken) continue;
    drawPickup(ctx, item.x, item.y, item.kind, t + item.bob);
  }

  const pa = game.mode === "play" ? alpha : 1;
  for (const e of game.enemies) {
    const ex = lerp(e.px, e.x, pa);
    const ey = lerp(e.py, e.y, pa);
    drawEnemy(ctx, ex, ey, e.w, e.h, e.facing, e.hp / e.maxHp, e.hurt > 0, t, e.kind, e.swipe, lightAmount(ex, ey, e.w, e.h, game.stage));
  }

  for (const g of game.grenades) {
    const gx = lerp(g.px, g.x, pa);
    const gy = lerp(g.py, g.y, pa);
    const bomb = getArt().pickups.grenade;
    if (ready(bomb)) {
      ctx.save();
      ctx.translate(gx + g.w / 2, gy + g.h / 2);
      ctx.rotate(Math.atan2(g.vy, g.vx) + Math.PI / 2);
      ctx.drawImage(bomb, -3.15, -4.2, 6.3, 8.4);
      ctx.restore();
    } else {
      ctx.fillStyle = "#6a7a48";
      ctx.fillRect(gx, gy, g.w, g.h);
      ctx.fillStyle = "#e0a24a";
      ctx.fillRect(gx + 2, gy + 2, 3, 3);
    }
  }

  const p = game.player;
  const px = lerp(p.px, p.x, pa);
  const py = lerp(p.py, p.y, pa);
  const blink = p.iframes > 0 && Math.floor(t * 18) % 2 === 0;
  if (!blink) {
    const trigger = p.firing || p.shotPose > 0;
    drawPlayer(
      ctx,
      px,
      py,
      p.w,
      p.h,
      p.facing,
      p.aimX,
      p.aimY,
      p.anim,
      p.climbing,
      p.grounded,
      Math.abs(p.vx),
      p.vy,
      trigger,
      lightAmount(px, py, p.w, p.h, game.stage),
    );
  }

  if (game.muzzle > 0) {
    const barrel = barrelPoint(p);
    ctx.fillStyle = "rgba(196,140,255,0.9)";
    ctx.fillRect(barrel.x - 2, barrel.y - 2, 4, 4);
  }

  ctx.strokeStyle = "#e8e2d6";
  ctx.lineWidth = 1.5;
  for (const b of game.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.stroke();
  }

  for (const q of game.particles) {
    const alpha = Math.max(0, q.life / q.max);
    if (q.chunk !== undefined) {
      const img = getArt().chunks[q.chunk % getArt().chunks.length];
      if (ready(img)) {
        const long = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = q.size / long;
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = true;
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot ?? 0);
        if (q.flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        continue;
      }
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x, q.y, q.size, q.size);
  }
  ctx.globalAlpha = 1;

  ctx.font = "10px 'Share Tech Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const f of game.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / 0.7);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  const lx = px + p.w / 2;
  const ly = py + p.h * 0.45;
  const light = ctx.createRadialGradient(lx, ly, 8, lx, ly, 110);
  light.addColorStop(0, "rgba(255,214,160,0.16)");
  light.addColorStop(1, "rgba(255,214,160,0)");
  ctx.fillStyle = light;
  ctx.fillRect(lx - 110, ly - 110, 220, 220);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const vig = ctx.createRadialGradient(cssW / 2, cssH / 2, cssH * 0.2, cssW / 2, cssH / 2, cssH * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cssW, cssH);

  if (game.hurtFlash > 0) {
    ctx.fillStyle = `rgba(226,61,61,${Math.min(0.35, game.hurtFlash)})`;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  if (game.mode !== "menu") {
    drawMinimap(ctx, game, cssW);
    drawExitHint(ctx, game, camX, camY, viewW, viewH, scale, cssW, cssH);
  }
  if (joy.active) drawJoy(ctx, joy);

  if (game.bannerT > 0 && game.mode === "play") {
    ctx.globalAlpha = Math.min(1, game.bannerT * 2);
    ctx.fillStyle = "#e8e2d6";
    ctx.font = "600 18px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(game.banner, cssW / 2, 78);
    ctx.globalAlpha = 1;
  }
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  choice: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const walls = getArt().walls;
  const xStart = Math.max(0, Math.floor(x0 / BG_CHUNK_X) * BG_CHUNK_X);
  const yStart = Math.max(0, Math.floor(y0 / BG_CHUNK_Y) * BG_CHUNK_Y);
  for (let ty = yStart; ty <= y1; ty += BG_CHUNK_Y) {
    for (let tx = xStart; tx <= x1; tx += BG_CHUNK_X) {
      if (tx >= stage.w || ty >= stage.h) continue;
      const variant = choice[ty * stage.w + tx] ?? 0;
      const img = walls[variant];
      if (!ready(img)) continue;
      const tilesW = Math.min(BG_CHUNK_X, stage.w - tx);
      const tilesH = Math.min(BG_CHUNK_Y, stage.h - ty);
      const dx = tx * TILE;
      const dy = ty * TILE;
      const dw = tilesW * TILE;
      const dh = tilesH * TILE;
      ctx.drawImage(
        img,
        0,
        0,
        img.naturalWidth * (tilesW / BG_CHUNK_X),
        img.naturalHeight * (tilesH / BG_CHUNK_Y),
        dx,
        dy,
        dw,
        dh,
      );
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(dx, dy, dw, 1);
      ctx.fillRect(dx, dy, 1, dh);
    }
  }
}

function drawSolid(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  tx: number,
  ty: number,
  time: number,
): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const hsh = hash(tx, ty);
  const above = (stage.tiles[(ty - 1) * stage.w + tx] ?? SOLID) !== SOLID;
  const below = (stage.tiles[(ty + 1) * stage.w + tx] ?? SOLID) !== SOLID;
  const leftOpen = tx > 0 && (stage.tiles[ty * stage.w + tx - 1] ?? SOLID) !== SOLID;
  const rightOpen = tx < stage.w - 1 && (stage.tiles[ty * stage.w + tx + 1] ?? SOLID) !== SOLID;
  const platform = getArt().platform;
  if (ready(platform)) {
    ctx.drawImage(platform, x, y, TILE, TILE);
  } else {
    ctx.fillStyle = hsh % 7 === 0 ? "#221e19" : "#141210";
    ctx.fillRect(x, y, TILE, TILE);
  }
  if (above) {
    const floor = getArt().floor;
    const band = 8;
    const edge = 2;
    if (ready(floor)) {
      const sw = 64;
      const sh = 32;
      const sx = (tx * sw) % Math.max(1, floor.naturalWidth - sw);
      const sy = (ty * 17) % Math.max(1, floor.naturalHeight - sh);
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(floor, sx, sy, sw, sh, x, y, TILE, band);
      ctx.imageSmoothingEnabled = smooth;
    } else {
      ctx.fillStyle = "#5c5a54";
      ctx.fillRect(x, y, TILE, band);
    }
    ctx.fillStyle = "#0a0908";
    ctx.fillRect(x, y + band, TILE, edge);
  }
  if (below) {
    ctx.fillStyle = "#0c0b0a";
    ctx.fillRect(x, y + TILE - 3, TILE, 3);
    if (hsh % 6 === 2) {
      const flicker = 0.75 + Math.sin(time * 14 + tx) * 0.25;
      const mouth = y + TILE + 11;
      ctx.fillStyle = `rgba(224,162,74,${0.14 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(x + 2, mouth);
      ctx.lineTo(x + TILE - 2, mouth);
      ctx.lineTo(x + TILE + 10, mouth + 36);
      ctx.lineTo(x - 10, mouth + 36);
      ctx.fill();
      drawFitting(ctx, x, y + TILE, flicker);
    }
  }
  if (leftOpen) {
    ctx.fillStyle = "#07080c";
    ctx.fillRect(x, y, 2, TILE);
    ctx.fillStyle = "#8a7844";
    ctx.fillRect(x, y, 1, TILE);
  }
  if (rightOpen) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + TILE - 2, y, 2, TILE);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
  }
}

function drawFitting(ctx: CanvasRenderingContext2D, x: number, by: number, flicker: number): void {
  ctx.fillStyle = "#3e382f";
  ctx.fillRect(x + 6, by, 4, 3);
  ctx.fillStyle = "#6a6154";
  ctx.beginPath();
  ctx.moveTo(x + 4, by + 3);
  ctx.lineTo(x + 12, by + 3);
  ctx.lineTo(x + TILE + 1, by + 10);
  ctx.lineTo(x - 1, by + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#100e0c";
  ctx.beginPath();
  ctx.moveTo(x + 6, by + 5);
  ctx.lineTo(x + 10, by + 5);
  ctx.lineTo(x + TILE - 1, by + 10);
  ctx.lineTo(x + 1, by + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(255,214,120,${0.95 * flicker})`;
  ctx.fillRect(x + 4, by + 7, 8, 2);
  ctx.fillStyle = `rgba(255,244,210,${0.9 * flicker})`;
  ctx.fillRect(x + 6, by + 7, 4, 1);
  ctx.fillStyle = "#8d8270";
  ctx.fillRect(x - 1, by + 10, TILE + 2, 1);
}

function drawLadder(
  ctx: CanvasRenderingContext2D,
  stage: Stage,
  tx: number,
  ty: number,
  viewX0: number,
): void {
  const leftLadder = tx > 0 && stage.tiles[ty * stage.w + tx - 1] === LADDER;
  if (leftLadder && tx - 1 >= viewX0) return;
  let start = tx;
  while (start > 0 && stage.tiles[ty * stage.w + start - 1] === LADDER) start--;
  let end = tx;
  while (end + 1 < stage.w && stage.tiles[ty * stage.w + end + 1] === LADDER) end++;
  const runW = (end - start + 1) * TILE;
  const drawW = PLAYER_W + 4;
  const x = start * TILE + (runW - drawW) / 2;
  const y = ty * TILE;
  const img = getArt().ladder;
  if (!ready(img)) {
    drawLadderFallback(ctx, x, y);
    return;
  }
  const segH = drawW / (img.naturalWidth / img.naturalHeight);
  let remaining = TILE;
  let destY = y;
  let srcOffset = segH <= 0 ? 0 : y % segH;
  while (remaining > 0.05) {
    const room = segH - srcOffset;
    const h = Math.min(remaining, room);
    const sy = (srcOffset / segH) * img.naturalHeight;
    const sh = (h / segH) * img.naturalHeight;
    if (sh > 0.25) ctx.drawImage(img, 0, sy, img.naturalWidth, sh, x, destY, drawW, h);
    destY += h;
    remaining -= h;
    srcOffset = 0;
  }
}

function drawLadderFallback(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#6d655a";
  ctx.fillRect(x + 1, y, 2, TILE);
  ctx.fillRect(x + LADDER_W - 3, y, 2, TILE);
  ctx.fillStyle = "#8d8476";
  ctx.fillRect(x + 1, y + 4, LADDER_W - 2, 2);
  ctx.fillRect(x + 1, y + 11, LADDER_W - 2, 2);
}

function drawGrate(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  const x = tx * TILE;
  const y = ty * TILE;
  ctx.fillStyle = "#c6aa62";
  ctx.fillRect(x, y, TILE, 2);
  ctx.fillStyle = "#3a3428";
  ctx.fillRect(x, y + 2, TILE, 1);
  ctx.fillStyle = "#6a6248";
  for (let i = 0; i < TILE; i += 4) ctx.fillRect(x + i, y + 3, 2, TILE - 3);
}

function drawExit(ctx: CanvasRenderingContext2D, stage: Stage, time: number): void {
  const e = stage.exit;
  ctx.fillStyle = "#121816";
  ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.strokeStyle = "#3ecf6e";
  ctx.lineWidth = 2;
  ctx.strokeRect(e.x + 3, e.y + 3, e.w - 6, e.h - 6);
  const glow = 0.45 + Math.sin(time * 4) * 0.25;
  ctx.fillStyle = `rgba(62,207,110,${glow})`;
  ctx.fillRect(e.x + e.w / 2 - 3, e.y + 8, 6, 6);
  ctx.fillStyle = "#e8e2d6";
  ctx.font = "9px 'Share Tech Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("HATCH", e.x + e.w / 2, e.y + e.h - 8);
}

function drawCheckpoints(ctx: CanvasRenderingContext2D, game: Game, time: number): void {
  game.stage.checkpoints.forEach((cp, i) => {
    if (i === 0) return;
    const x = cp.x + 8;
    const y = cp.y + 40;
    const on = i <= game.checkpoint;
    ctx.fillStyle = on ? "#e0a24a" : "#3a342c";
    ctx.globalAlpha = on ? 0.7 + Math.sin(time * 6) * 0.3 : 0.7;
    ctx.fillRect(x - 2, y - 10, 4, 10);
    ctx.globalAlpha = 1;
  });
}

const glowSprites = new Map<string, HTMLCanvasElement>();

type Lamp = { cx: number; top: number };
const lampCache = new WeakMap<Stage, Lamp[]>();
const BEAM_H = 36;

function lampsFor(stage: Stage): Lamp[] {
  const cached = lampCache.get(stage);
  if (cached) return cached;
  const list: Lamp[] = [];
  for (let ty = 0; ty < stage.h; ty++) {
    for (let tx = 0; tx < stage.w; tx++) {
      if ((stage.tiles[ty * stage.w + tx] ?? 0) !== SOLID) continue;
      if ((stage.tiles[(ty + 1) * stage.w + tx] ?? SOLID) === SOLID) continue;
      if (hash(tx, ty) % 6 !== 2) continue;
      list.push({ cx: tx * TILE + TILE / 2, top: (ty + 1) * TILE + 11 });
    }
  }
  lampCache.set(stage, list);
  return list;
}

/** 0 in the dark, 1 in the middle of a beam just under the fitting. */
function lightAmount(x: number, y: number, w: number, h: number, stage: Stage): number {
  const cx = x + w / 2;
  const samples = [y - 10, y + h * 0.25, y + h * 0.6, y + h * 0.92];
  let best = 0;
  for (const py of samples) {
    for (const lamp of lampsFor(stage)) {
      const t = (py - lamp.top) / BEAM_H;
      if (t < 0 || t > 1) continue;
      const half = 6 + t * 12;
      const dx = Math.abs(cx - lamp.cx);
      if (dx >= half) continue;
      const across = 1 - dx / half;
      const down = 1 - t * 0.45;
      const s = across * across * down;
      if (s > best) best = s;
    }
  }
  return best;
}

function lightFilter(amount: number): string {
  return `brightness(${(1 + amount * 0.75).toFixed(3)})`;
}

function silhouette(sprite: HTMLImageElement, color: string, key: string): HTMLCanvasElement {
  const cached = glowSprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.naturalWidth;
  canvas.height = sprite.naturalHeight;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.drawImage(sprite, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, canvas.width, canvas.height);
  glowSprites.set(key, canvas);
  return canvas;
}

function drawEdgeGlow(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  color: string,
  key: string,
  alpha: number,
): void {
  const tint = silhouette(sprite, color, key);
  ctx.save();
  const rings = [
    { pad: 0.7, a: alpha, steps: 12 },
    { pad: 1.4, a: alpha * 0.5, steps: 12 },
    { pad: 2.2, a: alpha * 0.2, steps: 8 },
  ];
  for (const ring of rings) {
    ctx.globalAlpha = ring.a;
    for (let i = 0; i < ring.steps; i++) {
      const ang = (i / ring.steps) * Math.PI * 2;
      ctx.drawImage(
        tint,
        dx + Math.cos(ang) * ring.pad,
        dy + Math.sin(ang) * ring.pad,
        dw,
        dh,
      );
    }
  }
  ctx.restore();
}

function drawPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: string,
  time: number,
): void {
  const bob = reduced ? 0 : Math.sin(time * 3) * 1.5;
  const sprite = getArt().pickups[kind as PickupKind];
  const hit = 14;
  const long = kind === "health" ? 14 : kind === "shells" ? 15 : 13;
  let dw = long;
  let dh = long;
  if (ready(sprite) && sprite.naturalHeight > 0) {
    const aspect = sprite.naturalWidth / sprite.naturalHeight;
    if (aspect >= 1) dh = long / aspect;
    else dw = long * aspect;
  }
  const dx = x + (hit - dw) / 2;
  const dy = y + hit - dh + bob;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(x + hit / 2, y + hit - 1, Math.max(6, dw * 0.32), 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const pulse = reduced ? 0.7 : 0.62 + Math.sin(time * 4) * 0.18;
  if (ready(sprite)) {
    const color = kind === "health" ? "rgb(64, 230, 116)" : "rgb(255, 148, 40)";
    drawEdgeGlow(ctx, sprite, dx, dy, dw, dh, color, kind, pulse * 0.5);
    ctx.drawImage(sprite, dx, dy, dw, dh);
    return;
  }
  const yy = y + bob;
  if (kind === "health") {
    ctx.fillStyle = "#163224";
    ctx.fillRect(x, yy, 14, 14);
    ctx.fillStyle = "#3ecf6e";
    ctx.fillRect(x + 6, yy + 2, 2, 10);
    ctx.fillRect(x + 2, yy + 6, 10, 2);
  } else if (kind === "grenade") {
    ctx.fillStyle = "#3e4a32";
    ctx.beginPath();
    ctx.arc(x + 7, yy + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0a24a";
    ctx.fillRect(x + 6, yy + 1, 2, 4);
  } else if (kind === "pistol") {
    ctx.fillStyle = "#c6a04a";
    ctx.fillRect(x + 2, yy + 3, 2, 8);
    ctx.fillRect(x + 6, yy + 3, 2, 8);
    ctx.fillRect(x + 10, yy + 3, 2, 8);
  } else {
    ctx.fillStyle = kind === "shells" ? "#6a3030" : "#3a3428";
    ctx.fillRect(x + 1, yy + 3, 12, 9);
    ctx.fillStyle = kind === "shells" ? "#e23d3d" : "#e0a24a";
    ctx.fillRect(x + 2, yy + 5, 10, 2);
    ctx.fillRect(x + 2, yy + 8, 10, 2);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  facing: number,
  aimX: number,
  aimY: number,
  anim: number,
  climbing: boolean,
  grounded: boolean,
  speed: number,
  vy: number,
  trigger: boolean,
  light = 0,
): void {
  const footX = x + w / 2;
  const footY = y + h;
  if (!climbing && grounded) {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(footX, footY - 1, 7, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const sprite = playerSprite(aimX, aimY, anim, climbing, speed, grounded, vy, trigger);
  if (!sprite) {
    drawPlayerFallback(ctx, x, y, w, h, facing, aimX, aimY);
    return;
  }
  // Source frames stay at frameboard resolution. Dest height is world units,
  // so the view transform downsamples the original instead of enlarging a tiny bitmap.
  const dh = sprite.worldH;
  const dw = (sprite.img.naturalWidth * dh) / sprite.img.naturalHeight;
  const flip = sprite.lockFlip ? !!sprite.flip : facing < 0;
  // Ladder aim frames are wide because of the gun. Pin the shell, not the bitmap center.
  const anchor = sprite.anchorX ?? 0.5;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = light > 0.04 ? lightFilter(light) : "none";
  if (flip) {
    ctx.translate(footX, footY);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite.img, -anchor * dw, -dh, dw, dh);
  } else {
    ctx.drawImage(sprite.img, footX - anchor * dw, footY - dh, dw, dh);
  }
  ctx.restore();
}

type PlayerFrame = { img: HTMLImageElement; worldH: number; flip?: boolean; lockFlip?: boolean; anchorX?: number };

function playerSprite(
  aimX: number,
  aimY: number,
  anim: number,
  climbing: boolean,
  speed: number,
  grounded: boolean,
  vy: number,
  trigger: boolean,
): PlayerFrame | null {
  const set = getArt().player;
  if (climbing) {
    if (trigger) {
      const straightUp = aimY < -0.75 && Math.abs(aimX) < 0.45;
      const straightDown = aimY > 0.75 && Math.abs(aimX) < 0.45;
      const raised = aimY < -0.35;
      const lowered = aimY > 0.35 && Math.abs(aimX) >= 0.45;
      const level = Math.abs(aimY) < 0.35;
      if (straightUp && ready(set.ladSky)) return { img: set.ladSky, worldH: 52.2, anchorX: 0.476 };
      if (straightDown && ready(set.ladShootDown)) return { img: set.ladShootDown, worldH: 50, anchorX: 0.55 };
      if (raised && ready(set.ladUp)) return { img: set.ladUp, worldH: 50.1, anchorX: 0.403 };
      if (lowered && ready(set.ladDown)) return { img: set.ladDown, worldH: 50, anchorX: 0.506 };
      if (level && ready(set.ladLevel)) return { img: set.ladLevel, worldH: 49.9, anchorX: 0.366 };
    }
    // Climbing up alternates the back-view with its mirror. Down and idle keep the old pose.
    if (vy < -8 && ready(set.climbUp)) {
      const step = reduced ? 0 : Math.floor(Math.abs(anim) * 4) % 2;
      return { img: set.climbUp, worldH: 48.2, flip: step === 1, lockFlip: true };
    }
    if (ready(set.climb)) return { img: set.climb, worldH: 56 };
  }
  if (aimY < -0.75 && Math.abs(aimX) < 0.45 && ready(set.aim)) return { img: set.aim, worldH: 65 };
  const moving = speed > 24;
  const raised = aimY < -0.35;
  const lowered = aimY > 0.35;
  const frames = raised ? set.up : lowered ? set.down : set.run;
  if (moving && frames.length > 0 && frames.every(ready)) {
    const index = reduced ? 0 : Math.floor(Math.abs(anim) * 0.62) % frames.length;
    const img = frames[index];
    return img ? { img, worldH: 47 } : null;
  }
  if (!moving && trigger && !raised && !lowered) {
    if (!grounded && ready(set.run[0])) return { img: set.run[0]!, worldH: 47 };
    if (grounded && ready(set.stand)) return { img: set.stand, worldH: 47 };
  }
  return ready(set.idle) ? { img: set.idle, worldH: 47 } : null;
}

function drawPlayerFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  facing: number,
  aimX: number,
  aimY: number,
): void {
  const cx = x + w / 2;
  ctx.fillStyle = "#5b4a9a";
  ctx.fillRect(cx - 7, y + 8, 14, h - 12);
  ctx.fillStyle = "#d7c4ff";
  ctx.fillRect(cx - 5, y, 10, 10);
  const ang = Math.atan2(aimY, aimX || facing);
  ctx.save();
  ctx.translate(cx, y + 18);
  ctx.rotate(ang);
  ctx.fillStyle = "#2a2144";
  ctx.fillRect(0, -2, 14, 4);
  ctx.restore();
}

/** Tall mutant walk is frames 1-2-3-2-5. Attack clips can take over this later. */
const MUTANT_WALK = [0, 1, 2, 1, 4];
const MUTANT_DRAW_H = 56;
/** All-fours mutant. About 74% of Monchel's 47px frame height, tall enough for level shots. */
const MUTANT2_WALK = [0, 1, 2, 3, 4];
const MUTANT2_DRAW_H = 35;

function drawMutantSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  facing: number,
  hp: number,
  flash: boolean,
  drawH: number,
  light: number,
): void {
  const dh = drawH;
  const dw = (img.naturalWidth * dh) / img.naturalHeight;
  const footX = x + w / 2;
  const footY = y + h;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(footX, footY - 1, Math.min(dw * 0.28, 12), 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = flash ? "brightness(2.6)" : light > 0.04 ? lightFilter(light) : "none";
  if (facing < 0) {
    ctx.translate(footX, footY);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  } else {
    ctx.drawImage(img, footX - dw / 2, footY - dh, dw, dh);
  }
  ctx.restore();
  ctx.fillStyle = "#e23d3d";
  ctx.fillRect(footX - dw * 0.22, footY - dh - 3, dw * 0.44 * hp, 2);
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  facing: number,
  hp: number,
  flash: boolean,
  time: number,
  kind: string,
  swipe: number,
  light = 0,
): void {
  if (kind === "mutant2" && swipe >= 0) {
    const frames = getArt().swipe;
    const img = frames[Math.min(3, swipe)];
    if (ready(img)) {
      drawMutantSprite(ctx, img, x, y, w, h, facing, hp, flash, MUTANT2_DRAW_H, light);
      return;
    }
  }
  if (kind === "mutant" || kind === "mutant2") {
    const crawler = kind === "mutant2";
    const frames = crawler ? getArt().crawler : getArt().mutant;
    const order = crawler ? MUTANT2_WALK : MUTANT_WALK;
    if (frames.length >= 5 && frames.every(ready)) {
      const step = reduced ? 0 : order[Math.floor(time * 8) % order.length] ?? 0;
      const img = frames[step];
      if (img) {
        drawMutantSprite(ctx, img, x, y, w, h, facing, hp, flash, crawler ? MUTANT2_DRAW_H : MUTANT_DRAW_H, light);
        return;
      }
    }
  }
  const bob = Math.sin(time * 6 + x) * 0.8;
  const cx = x + w / 2;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x + 4, y + h - 2, w - 8, 2);
  ctx.fillStyle = flash ? "#e8e2d6" : "#4a3034";
  ctx.fillRect(x + 2, y + 10 + bob, w - 4, h - 14);
  ctx.fillStyle = flash ? "#ffffff" : "#6a4448";
  ctx.fillRect(x + 4, y + 14 + bob, w - 10, 6);
  const step = Math.sin(time * 10 + x) * 2;
  ctx.fillStyle = "#2a1c1e";
  for (let i = 0; i < 3; i++) {
    const lx = x + 4 + i * 7;
    ctx.fillRect(lx, y + h - 8 + (i % 2 ? step : -step), 2, 8);
  }
  const hx = facing > 0 ? x + w - 10 : x;
  ctx.fillStyle = flash ? "#ffffff" : "#7a5054";
  ctx.fillRect(hx, y + 4 + bob, 10, 10);
  ctx.fillStyle = "#e0a24a";
  ctx.fillRect(facing > 0 ? hx + 6 : hx + 2, y + 7 + bob, 3, 3);
  ctx.fillStyle = "#e23d3d";
  ctx.fillRect(x + 2, y + 2, (w - 4) * hp, 2);
}

function drawMinimap(ctx: CanvasRenderingContext2D, game: Game, cssW: number): void {
  const mw = 96;
  const mh = 38;
  const sx = cssW - mw - 12;
  const sy = 64;
  ctx.fillStyle = "rgba(8,14,22,0.78)";
  ctx.fillRect(sx, sy, mw, mh);
  ctx.strokeStyle = "rgba(126,200,227,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, mw - 1, mh - 1);
  const stage = game.stage;
  const sxz = (mw - 4) / (stage.w * TILE);
  const syz = (mh - 4) / (stage.h * TILE);
  ctx.fillStyle = "#3a3428";
  for (let ty = 0; ty < stage.h; ty++) {
    for (let tx = 0; tx < stage.w; tx++) {
      if (stage.tiles[ty * stage.w + tx] !== SOLID) continue;
      ctx.fillRect(sx + 2 + tx * TILE * sxz, sy + 2 + ty * TILE * syz, Math.max(1, TILE * sxz), Math.max(1, TILE * syz));
    }
  }
  const ex = game.stage.exit;
  ctx.fillStyle = "#3ecf6e";
  ctx.fillRect(sx + 2 + ex.x * sxz, sy + 2 + ex.y * syz, 3, 3);
  ctx.fillStyle = "#e23d3d";
  for (const e of game.enemies) {
    ctx.fillRect(sx + 2 + e.x * sxz, sy + 2 + e.y * syz, 2, 2);
  }
  ctx.fillStyle = "#e0a24a";
  ctx.fillRect(sx + 2 + game.player.x * sxz, sy + 2 + game.player.y * syz, 2, 3);
}

function drawExitHint(
  ctx: CanvasRenderingContext2D,
  game: Game,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  scale: number,
  cssW: number,
  cssH: number,
): void {
  const ex = game.stage.exit.x + game.stage.exit.w / 2;
  const ey = game.stage.exit.y + game.stage.exit.h / 2;
  if (ex > camX + 8 && ex < camX + viewW - 8 && ey > camY + 8 && ey < camY + viewH - 8) return;
  const sx = (ex - camX) * scale;
  const sy = (ey - camY) * scale;
  const m = 28;
  const x = Math.max(m, Math.min(cssW - m, sx));
  const y = Math.max(m + 48, Math.min(cssH - m - 80, sy));
  ctx.fillStyle = "#3ecf6e";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawJoy(ctx: CanvasRenderingContext2D, joy: JoyVisual): void {
  ctx.beginPath();
  ctx.arc(joy.ox, joy.oy, 54, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(224,162,74,0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(joy.kx, joy.ky, 22, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(232,226,214,0.82)";
  ctx.fill();
}
