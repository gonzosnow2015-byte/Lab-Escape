import { sfx, unlockAudio } from "@/game/audio";
import {
  ACCEL_A,
  ACCEL_G,
  AMMO_NAME,
  AMMO_PACK,
  CLIMB,
  COYOTE,
  ENEMY_H,
  ENEMY_W,
  MUTANT_H,
  MUTANT_W,
  MUTANT2_H,
  MUTANT2_W,
  FRICTION,
  GRAV_APEX,
  GRAV_FALL,
  GRAV_RISE,
  JUMP_BUFFER,
  JUMP_V,
  MOVE_SPEED,
  PICKUP,
  PLAYER_H,
  PLAYER_W,
  TERM_V,
  TILE,
  WEAPONS,
} from "@/game/constants";
import { aabb, blocked, cell, moveBody, onLadder, supportPoint } from "@/game/physics";
import { SOLID, STAGES, ONEWAY, type Stage } from "@/game/stage";
import type { Actions, Mode, PickupKind } from "@/game/types";

const SAVE_KEY = "monchel-escape-v1";

export type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  r: number;
};

export type Grenade = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  fuse: number;
};

export type Enemy = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  facing: 1 | -1;
  grounded: boolean;
  hp: number;
  maxHp: number;
  hurt: number;
  dir: 1 | -1;
  kind: "mutant" | "mutant2";
  /** -1 while walking. 0–3 is the Mutant 2 swipe frame, which only plays once it has stopped. */
  swipe: number;
  attack: number;
  halt: number;
};

export type Pickup = {
  x: number;
  y: number;
  kind: PickupKind;
  taken: boolean;
  bob: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  chunk?: number;
  rot?: number;
  spin?: number;
  flip?: number;
};

export type Floater = {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
};

export type Player = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  facing: 1 | -1;
  grounded: boolean;
  energy: number;
  climbing: boolean;
  coyote: number;
  jumpBuf: number;
  drop: number;
  ladderLock: number;
  iframes: number;
  weapon: number;
  fireCd: number;
  firing: boolean;
  shotPose: number;
  anim: number;
  aimX: number;
  aimY: number;
};

function readBest(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw) as { v?: number; best?: number };
    if (data.v !== 1 || typeof data.best !== "number") return 0;
    return data.best;
  } catch {
    return 0;
  }
}

function writeBest(best: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, best }));
  } catch {
    /* private mode */
  }
}

export function quantizeAim(ax: number, ay: number, facing: 1 | -1): { x: number; y: number } {
  let x = Math.abs(ax) < 0.35 ? 0 : Math.sign(ax);
  let y = Math.abs(ay) < 0.35 ? 0 : Math.sign(ay);
  if (x === 0 && y === 0) x = facing;
  const ang = Math.atan2(y, x);
  const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.cos(snap), y: Math.sin(snap) };
}

/** Barrel in world pixels. Offsets match the full-res Monchel frames (feet = hitbox bottom). */
export function barrelPoint(p: {
  x: number;
  y: number;
  w: number;
  h: number;
  aimX: number;
  aimY: number;
  facing?: number;
  climbing?: boolean;
  vx?: number;
  grounded?: boolean;
}): { x: number; y: number } {
  const footX = p.x + p.w / 2;
  const footY = p.y + p.h;
  const face = p.facing || Math.sign(p.aimX) || 1;
  if (p.climbing) {
    const face = Math.sign(p.aimX) || p.facing || 1;
    if (p.aimY < -0.75 && Math.abs(p.aimX) < 0.45) return { x: footX + face * 5, y: footY - 52 };
    if (p.aimY < -0.35) return { x: footX + face * 27, y: footY - 48 };
    if (p.aimY > 0.35 && Math.abs(p.aimX) >= 0.45) return { x: footX + face * 31, y: footY - 12 };
    if (Math.abs(p.aimY) < 0.35) return { x: footX + face * 30, y: footY - 38 };
    return { x: footX + face * 4, y: footY - 8 };
  }
  if (p.aimY < -0.75 && Math.abs(p.aimX) < 0.45) return { x: footX + face * 4, y: footY - 64 };
  if (p.aimY < -0.35) return { x: footX + face * 24, y: footY - 42 };
  if (p.aimY > 0.35) return { x: footX + face * 21, y: footY - 20 };
  // Airborne and running shots use a run frame, which holds the gun further out.
  if (Math.abs(p.aimY) < 0.35 && (Math.abs(p.vx ?? 0) > 24 || p.grounded === false)) {
    return { x: footX + face * 29, y: footY - 30 };
  }
  return { x: footX + face * 22, y: footY - 30 };
}

export class Game {
  stage: Stage;
  stageIndex = 0;
  player: Player;
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  bullets: Bullet[] = [];
  grenades: Grenade[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  cam = { x: 0, y: 0 };
  camReady = false;
  shake = 0;
  mode: Mode = "menu";
  time = 0;
  score = 0;
  best = 0;
  timeBonus = 0;
  clearBonus = 0;
  ammo: number[] = [];
  banner = "";
  bannerT = 0;
  muzzle = 0;
  hurtFlash = 0;
  checkpoint = 0;
  suppressJump = false;
  private hitstop = 0;
  private dryCd = 0;
  private finished = false;

  constructor(stageId = "shaft-01") {
    const idx = STAGES.findIndex((s) => s.id === stageId);
    this.stageIndex = idx < 0 ? 0 : idx;
    this.stage = STAGES[this.stageIndex] ?? STAGES[0];
    this.best = readBest();
    this.player = this.makePlayer(this.stage.spawn.x, this.stage.spawn.y);
    this.ammo = WEAPONS.map((w) => w.startAmmo);
    this.spawnWorld();
  }

  private makePlayer(x: number, y: number): Player {
    return {
      x,
      y,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: 0,
      vy: 0,
      px: x,
      py: y,
      facing: 1,
      grounded: false,
      energy: 100,
      climbing: false,
      coyote: COYOTE,
      jumpBuf: 0,
      drop: 0,
      ladderLock: 0,
      iframes: 0,
      weapon: 0,
      fireCd: 0,
      firing: false,
      shotPose: 0,
      anim: 0,
      aimX: 1,
      aimY: 0,
    };
  }

  private spawnWorld(): void {
    this.enemies = this.stage.enemies.map((e) => {
      const tall = e.kind === "mutant";
      const w = tall ? MUTANT_W : MUTANT2_W;
      const h = tall ? MUTANT_H : MUTANT2_H;
      const x = e.x + (tall ? 0 : (ENEMY_W - w) / 2);
      const y = e.y + (tall ? 0 : ENEMY_H - h);
      return {
        x,
        y,
        w,
        h,
        vx: 0,
        vy: 0,
        px: x,
        py: y,
        facing: -1 as const,
        grounded: false,
        hp: tall ? 6 : 3,
        maxHp: tall ? 6 : 3,
        hurt: 0,
        dir: (e.x >= this.stage.spawn.x ? 1 : -1) as 1 | -1,
        kind: tall ? ("mutant" as const) : ("mutant2" as const),
        swipe: -1,
        attack: 0,
        halt: 0,
      };
    });
    this.pickups = this.stage.pickups.map((p) => ({
      x: p.x,
      y: p.y,
      kind: p.kind,
      taken: false,
      bob: p.x * 0.01,
    }));
    this.bullets = [];
    this.grenades = [];
    this.particles = [];
    this.floaters = [];
  }

  start(): void {
    if (this.mode === "play") return;
    if (this.mode === "clear") {
      this.reset();
      return;
    }
    this.mode = "play";
    this.suppressJump = true;
    unlockAudio();
  }

  reset(): void {
    const spawn = this.stage.checkpoints[0] ?? this.stage.spawn;
    this.player = this.makePlayer(spawn.x, spawn.y);
    this.ammo = WEAPONS.map((w) => w.startAmmo);
    this.spawnWorld();
    this.time = 0;
    this.score = 0;
    this.timeBonus = 0;
    this.clearBonus = 0;
    this.finished = false;
    this.checkpoint = 0;
    this.banner = "";
    this.bannerT = 0;
    this.mode = "play";
    this.suppressJump = true;
    this.hitstop = 0;
  }

  togglePause(): void {
    if (this.mode === "play") this.mode = "paused";
    else if (this.mode === "paused") this.mode = "play";
  }

  setWeapon(index: number): void {
    if (index < 0 || index >= WEAPONS.length) return;
    this.player.weapon = index;
  }

  handleUi(a: Actions): void {
    if (this.mode === "menu" && (a.confirmPressed || a.jumpPressed || a.pausePressed)) {
      this.mode = "play";
      this.suppressJump = true;
    } else if (this.mode === "play" && a.pausePressed) {
      this.mode = "paused";
    } else if (this.mode === "paused" && (a.pausePressed || a.confirmPressed)) {
      this.mode = "play";
    } else if (this.mode === "clear" && a.confirmPressed) {
      this.reset();
    }
  }

  private burst(x: number, y: number, color: string, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 180) this.particles.shift();
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 30,
        life: 0.3 + Math.random() * 0.35,
        max: 0.65,
        size: 1.5 + Math.random() * 2.2,
        color,
        grav: 400,
      });
    }
  }

  private float(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, life: 0.7, color });
  }

  private killEnemy(e: Enemy): void {
    this.score += 150;
    this.gib(e.x + e.w / 2, e.y + e.h / 2);
    this.float(e.x, e.y, "150", "#e0a24a");
    this.shake = Math.min(8, this.shake + 3.5);
    this.hitstop = 0.045;
    sfx.hit();
    e.hp = 0;
  }

  private gib(x: number, y: number): void {
    const n = 7;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 180) this.particles.shift();
      const ang = Math.random() * Math.PI * 2;
      const sp = 55 + Math.random() * 95;
      const life = 0.7 + Math.random() * 0.45;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 50,
        life,
        max: life,
        size: 9 + Math.random() * 5,
        color: "#fff",
        grav: 560,
        chunk: Math.floor(Math.random() * 5),
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 9,
        flip: Math.random() < 0.5 ? 1 : 0,
      });
    }
  }

  private hurtPlayer(fromX: number, amount: number): void {
    const p = this.player;
    if (p.iframes > 0 || this.mode !== "play") return;
    p.energy = Math.max(0, p.energy - amount);
    p.iframes = 0.9;
    p.vy = -170;
    p.climbing = false;
    const dir = Math.sign(p.x + p.w / 2 - fromX) || -p.facing;
    p.vx = dir * 150;
    this.shake = Math.min(8, this.shake + 4);
    this.hurtFlash = 0.35;
    this.banner = "CONTACT";
    this.bannerT = 0.6;
    sfx.hurt();
    if (p.energy <= 0) this.downPlayer();
  }

  private downPlayer(): void {
    const cp = this.stage.checkpoints[this.checkpoint] ?? this.stage.spawn;
    const p = this.player;
    p.x = cp.x;
    p.y = cp.y;
    p.vx = 0;
    p.vy = 0;
    p.energy = 80;
    p.iframes = 1.4;
    p.climbing = false;
    this.banner = "SIGNAL LOST";
    this.bannerT = 1.1;
    this.hurtFlash = 0.5;
    this.shake = 6;
  }

  private explode(x: number, y: number, radius: number, damage: number): void {
    sfx.grenade();
    this.shake = Math.min(9, this.shake + 6);
    this.burst(x, y, "#e0a24a", 22, 180);
    this.burst(x, y, "#e23d3d", 10, 90);
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const d = Math.hypot(cx - x, cy - y);
      const inner = 18;
      if (d > radius) continue;
      if (d > inner && blocked(this.stage, x, y, cx, cy)) continue;
      const t = d <= inner ? 1 : (radius - d) / (radius - inner);
      const dealt = Math.max(1, Math.round(damage * t));
      e.hp -= dealt;
      e.hurt = 0.12;
      e.vx += Math.sign(cx - x) * 80;
      this.mutantHit(e.kind);
      if (e.hp <= 0) this.killEnemy(e);
    }
    const pcx = p.x + p.w / 2;
    const pcy = p.y + p.h / 2;
    const pd = Math.hypot(pcx - x, pcy - y);
    if (pd < radius * 0.85 && !blocked(this.stage, x, y, pcx, pcy)) {
      this.hurtPlayer(x, Math.round(10 + (1 - pd / radius) * 22));
    }
  }

  private shoot(): void {
    const p = this.player;
    const weapon = WEAPONS[p.weapon] ?? WEAPONS[0];
    if (p.fireCd > 0) return;
    if (!weapon.infinite && this.ammo[p.weapon] <= 0) {
      if (this.dryCd <= 0) {
        sfx.dry();
        this.dryCd = 0.25;
      }
      return;
    }
    const dir = { x: p.aimX, y: p.aimY };
    const barrel = barrelPoint(p);
    const muzzleX = barrel.x;
    const muzzleY = barrel.y;
    if (weapon.kind === "grenade") {
      this.grenades.push({
        x: muzzleX - 4,
        y: muzzleY - 4,
        w: 8,
        h: 8,
        vx: dir.x * weapon.speed,
        vy: dir.y * weapon.speed - 70,
        px: muzzleX,
        py: muzzleY,
        fuse: 3,
      });
      sfx.launch();
    } else {
      const base = Math.atan2(dir.y, dir.x);
      const n = weapon.pellets;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const jitter = weapon.id === "smg" ? (Math.random() * 2 - 1) * weapon.spread : t * weapon.spread;
        const a = base + jitter;
        this.bullets.push({
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(a) * weapon.speed,
          vy: Math.sin(a) * weapon.speed,
          life: weapon.life,
          damage: weapon.damage,
          r: weapon.id === "shotgun" ? 2 : 2.4,
        });
      }
      if (weapon.id === "shotgun") sfx.shotgun();
      else if (weapon.id === "smg") sfx.smg();
      else sfx.shoot();
      if (!p.climbing) p.vx -= dir.x * (weapon.id === "shotgun" ? 70 : 10);
    }
    if (!weapon.infinite) {
      this.ammo[p.weapon] -= 1;
      if (this.ammo[p.weapon] <= 0) {
        // Shotgun, then SMG, then 9mm. Grenades only when every gun is empty.
        const next = [2, 1, 0, 3].find((i) => this.ammo[i] > 0);
        if (next !== undefined) this.setWeapon(next);
      }
    }
    p.fireCd = weapon.rate;
    p.shotPose = 0.22;
    this.muzzle = 0.045;
  }

  private tryJump(a: Actions): void {
    const p = this.player;
    if (this.suppressJump) {
      this.suppressJump = false;
      p.jumpBuf = 0;
      return;
    }
    if (a.jumpPressed) p.jumpBuf = JUMP_BUFFER;
    else p.jumpBuf = Math.max(0, p.jumpBuf - 1 / 60);

    const drop = a.jumpPressed && a.aimY > 0.4 && p.grounded && !p.climbing;
    if (drop) {
      p.drop = 0.2;
      p.grounded = false;
      p.jumpBuf = 0;
      p.vy = 40;
      return;
    }
    const can = p.grounded || p.coyote > 0 || p.climbing;
    if (p.jumpBuf > 0 && can) {
      if (p.climbing) p.ladderLock = 0.16;
      p.climbing = false;
      p.vy = JUMP_V;
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      if (Math.abs(a.moveX) > 0.2) p.vx = a.moveX * MOVE_SPEED;
      sfx.jump();
    } else if (a.jumpReleased && p.vy < 0) {
      p.vy *= 0.48;
    }
  }

  fixed(dt: number, a: Actions): void {
    if (this.mode !== "play") {
      sfx.smgStop();
      return;
    }
    if (a.slot >= 0) this.setWeapon(a.slot);
    if (a.nextWeapon) this.setWeapon((this.player.weapon + 1) % WEAPONS.length);
    if (a.prevWeapon) this.setWeapon((this.player.weapon + WEAPONS.length - 1) % WEAPONS.length);

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.player.iframes = Math.max(0, this.player.iframes - dt);
      return;
    }

    const p = this.player;
    p.px = p.x;
    p.py = p.y;
    this.time += dt;
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.shotPose = Math.max(0, p.shotPose - dt);
    p.firing = a.fire;
    p.iframes = Math.max(0, p.iframes - dt);
    p.drop = Math.max(0, p.drop - dt);
    p.ladderLock = Math.max(0, p.ladderLock - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.dryCd = Math.max(0, this.dryCd - dt);
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    const aim = quantizeAim(a.aimX, a.aimY, p.facing);
    p.aimX = aim.x;
    p.aimY = aim.y;
    if (Math.abs(a.aimX) > 0.35) p.facing = a.aimX > 0 ? 1 : -1;
    else if (Math.abs(a.moveX) > 0.35) p.facing = a.moveX > 0 ? 1 : -1;

    const ladder = onLadder(this.stage, p);
    if (p.climbing) {
      if (!ladder || p.ladderLock > 0) p.climbing = false;
    } else if (ladder && p.ladderLock <= 0 && Math.abs(a.aimY) > 0.45) {
      p.climbing = true;
      p.vy = 0;
      p.grounded = false;
    }

    this.tryJump(a);

    if (p.climbing) {
      const climbY = Math.abs(a.aimY) > 0.3 ? Math.sign(a.aimY) : 0;
      const climbX = Math.abs(a.moveX) > 0.3 ? a.moveX : 0;
      p.vx = climbX * CLIMB;
      p.vy = climbY * CLIMB;
      p.grounded = false;
    } else {
      const target = a.moveX * MOVE_SPEED;
      const rate = p.grounded ? (Math.abs(a.moveX) > 0.05 ? ACCEL_G : FRICTION) : ACCEL_A;
      const diff = target - p.vx;
      const maxStep = rate * dt;
      p.vx += Math.max(-maxStep, Math.min(maxStep, diff));
      let g = GRAV_FALL;
      if (p.vy < -90) g = GRAV_RISE;
      else if (p.vy < 0) g = GRAV_APEX;
      p.vy = Math.min(TERM_V, p.vy + g * dt);
    }

    if (p.climbing && p.vy < -8) p.anim += dt;
    else if (p.grounded && Math.abs(p.vx) > 20) p.anim += dt * 13;

    const moved = moveBody(p, dt, this.stage, {
      oneway: true,
      stepUp: p.climbing ? 14 : 6,
      drop: p.drop > 0,
    });
    if (!p.climbing) {
      p.grounded = moved.grounded;
      if (p.grounded) p.coyote = COYOTE;
      else p.coyote = Math.max(0, p.coyote - dt);
      if (p.grounded) p.vy = Math.max(0, p.vy);
    }

    if (p.y > this.stage.h * 16 + 8) this.downPlayer();

    const weapon = WEAPONS[p.weapon] ?? WEAPONS[0];
    const spraying = weapon.id === "smg" && a.fire && (this.ammo[p.weapon] ?? 0) > 0;
    if (!spraying) sfx.smgStop();
    if ((weapon.auto && a.fire) || (!weapon.auto && a.firePressed)) this.shoot();

    this.stepBullets(dt);
    this.stepGrenades(dt);
    this.stepEnemies(dt);
    this.stepPickups();
    this.stepFx(dt);
    this.touchCheckpoints();
    this.touchExit();
  }

  private stepBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.bullets.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / 8));
      const sdt = dt / steps;
      let dead = false;
      for (let s = 0; s < steps; s++) {
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        if (supportPoint(this.stage, b.x, b.y) && this.stageTileSolid(b.x, b.y)) {
          this.burst(b.x, b.y, "#e0a24a", 3, 40);
          dead = true;
          break;
        }
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (b.x < e.x - 2 || b.x > e.x + e.w + 2 || b.y < e.y - 2 || b.y > e.y + e.h + 2) continue;
          e.hp -= b.damage;
          e.hurt = 0.08;
          e.vx += Math.sign(b.vx) * 20;
          this.burst(b.x, b.y, "#e8e2d6", 4, 70);
          this.mutantHit(e.kind);
          if (e.hp <= 0) this.killEnemy(e);
          else sfx.hit();
          dead = true;
          break;
        }
        if (dead) break;
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  private mutantHit(kind: Enemy["kind"]): void {
    if (kind === "mutant") sfx.mutant1();
    else sfx.mutant2();
  }

  private stageTileSolid(x: number, y: number): boolean {
    const tx = Math.floor(x / 16);
    const ty = Math.floor(y / 16);
    if (tx < 0 || ty < 0 || tx >= this.stage.w || ty >= this.stage.h) return true;
    const v = this.stage.tiles[ty * this.stage.w + tx];
    return v === 1 || v === 2;
  }

  private stepGrenades(dt: number): void {
    const REST = 0.56;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.px = g.x;
      g.py = g.y;
      g.fuse -= dt;
      g.vy = Math.min(TERM_V, g.vy + 1200 * dt);
      const speed = Math.hypot(g.vx, g.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / 4));
      const sdt = dt / steps;
      let hitEnemy = false;
      for (let s = 0; s < steps && !hitEnemy; s++) {
        g.x += g.vx * sdt;
        if (this.grenadeHits(g)) {
          const into = g.vx > 0;
          g.x = into
            ? Math.floor((g.x + g.w - 0.01) / TILE) * TILE - g.w - 0.05
            : Math.floor(g.x / TILE) * TILE + TILE + 0.05;
          g.vx = Math.abs(g.vx) * REST < 22 ? 0 : -Math.sign(g.vx || (into ? 1 : -1)) * Math.abs(g.vx) * REST;
        }
        const prevBottom = g.y + g.h;
        g.y += g.vy * sdt;
        const floor = g.vy > 0 && this.grenadeFloor(g, prevBottom);
        const ceiling = g.vy < 0 && this.grenadeCeiling(g);
        if (floor) {
          const top = Math.floor((g.y + g.h - 0.01) / TILE) * TILE;
          g.y = top - g.h - 0.05;
          const bounce = -g.vy * REST;
          g.vy = bounce < -44 ? bounce : 0;
          g.vx *= 0.74;
          if (Math.abs(g.vx) < 16) g.vx = 0;
        } else if (ceiling) {
          g.y = Math.floor(g.y / TILE) * TILE + TILE + 0.05;
          g.vy = Math.abs(g.vy) * REST < 36 ? 0 : Math.abs(g.vy) * REST;
        }
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (aabb(g, e)) {
            hitEnemy = true;
            break;
          }
        }
      }
      if (hitEnemy || g.fuse <= 0) {
        this.explode(g.x + g.w / 2, g.y + g.h / 2, 58, 5);
        this.grenades.splice(i, 1);
      }
    }
  }

  /** Side edges only. The bottom is inset so resting on a floor is not a wall. */
  private grenadeHits(g: Grenade): boolean {
    const y0 = g.y + 1;
    const y1 = g.y + g.h - 3;
    const pts: [number, number][] = [
      [g.x + 0.5, y0],
      [g.x + 0.5, y1],
      [g.x + g.w - 0.5, y0],
      [g.x + g.w - 0.5, y1],
    ];
    return pts.some(([x, y]) => cell(this.stage, Math.floor(x / TILE), Math.floor(y / TILE)) === SOLID);
  }

  private grenadeCeiling(g: Grenade): boolean {
    const y = g.y + 0.5;
    const xs = [g.x + 1, g.x + g.w / 2, g.x + g.w - 1];
    return xs.some((x) => cell(this.stage, Math.floor(x / TILE), Math.floor(y / TILE)) === SOLID);
  }

  /** Solid floor, or a one-way the grenade fell onto. Ladders are open. */
  private grenadeFloor(g: Grenade, prevBottom: number): boolean {
    const y = g.y + g.h - 0.4;
    const xs = [g.x + 1, g.x + g.w / 2, g.x + g.w - 1];
    for (const x of xs) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const v = cell(this.stage, tx, ty);
      if (v === SOLID) return true;
      if (v === ONEWAY && prevBottom <= ty * TILE + 1.5) return true;
    }
    return false;
  }

  private stepEnemies(dt: number): void {
    const SWIPE_FRAME = 0.13;
    const SWIPE_HOLD = 0.18;
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) {
        this.enemies.splice(i, 1);
        continue;
      }
      e.px = e.x;
      e.py = e.y;
      e.hurt = Math.max(0, e.hurt - dt);
      const dx = p.x + p.w / 2 - (e.x + e.w / 2);
      const dy = p.y + p.h / 2 - (e.y + e.h / 2);
      const playerStill = p.grounded && !p.climbing && Math.abs(p.vx) < 20 && Math.abs(p.vy) < 40;
      // Center gap of 38 is about a hand's width past the body, so it walks in before the swipe.
      const inReach = e.kind === "mutant2" && e.grounded && Math.abs(dy) < 40 && Math.abs(dx) < 38;
      const wantSwipe = inReach && playerStill;
      let hunting = false;
      if (e.kind !== "mutant2") e.swipe = -1;
      if (e.kind === "mutant2" && e.attack > 0) {
        e.vx = 0;
        const face: 1 | -1 = dx >= 0 ? 1 : -1;
        e.dir = face;
        e.facing = face;
        const prev = e.attack;
        e.attack += dt;
        e.swipe = Math.min(3, Math.floor(e.attack / SWIPE_FRAME));
        const strike = SWIPE_FRAME * 2;
        if (prev < strike && e.attack >= strike && inReach && dx * face > -10) {
          this.hurtPlayer(e.x + e.w / 2, 16);
        }
        if (e.attack >= SWIPE_FRAME * 4) {
          e.attack = 0;
          e.swipe = wantSwipe ? 0 : -1;
        }
      } else if (wantSwipe) {
        e.vx = 0;
        const face: 1 | -1 = dx >= 0 ? 1 : -1;
        e.dir = face;
        e.facing = face;
        e.swipe = 0;
        e.halt += dt;
        if (e.halt >= SWIPE_HOLD) {
          e.attack = 0.001;
          e.halt = 0;
          e.swipe = 0;
        }
      } else {
        e.halt = 0;
        if (e.kind === "mutant2") e.swipe = -1;
        hunting = Math.abs(dy) < 52 && Math.abs(dx) < 150 && Math.abs(dx) > 8;
        if (hunting) {
          const want: 1 | -1 = dx > 0 ? 1 : -1;
          const probeX = e.x + e.w / 2 + want * (e.w / 2 + 3);
          const path = !e.grounded || supportPoint(this.stage, probeX, e.y + e.h + 3);
          e.dir = want;
          e.facing = want;
          e.vx = path ? e.dir * 42 : 0;
        } else {
          e.facing = e.dir;
          e.vx = e.dir * 42;
        }
      }
      e.vy = Math.min(TERM_V, e.vy + GRAV_FALL * dt);
      const res = moveBody(e, dt, this.stage, { oneway: true, stepUp: 4, drop: false });
      e.grounded = res.grounded;
      if (e.swipe < 0 && !hunting) {
        const aheadX = e.x + e.w / 2 + e.dir * (e.w / 2 + 3);
        const footY = e.y + e.h + 3;
        const floorAhead = supportPoint(this.stage, aheadX, footY);
        if (res.hitWall || (e.grounded && !floorAhead)) e.dir = (e.dir * -1) as 1 | -1;
      }
      if (e.swipe < 0 && p.iframes <= 0 && aabb(p, e)) this.hurtPlayer(e.x + e.w / 2, 16);
    }
  }

  private stepPickups(): void {
    const p = this.player;
    for (const item of this.pickups) {
      if (item.taken) continue;
      if (!aabb(p, { x: item.x, y: item.y, w: PICKUP, h: PICKUP })) continue;
      item.taken = true;
      if (item.kind === "health") {
        p.energy = Math.min(100, p.energy + 35);
        this.float(item.x, item.y, "+35", "#3ecf6e");
        sfx.medikit();
      } else {
        const idx = item.kind === "pistol" ? 0 : item.kind === "smg" ? 1 : item.kind === "shells" ? 2 : 3;
        const amount = AMMO_PACK[item.kind];
        if (!WEAPONS[idx]?.infinite) this.ammo[idx] += amount;
        this.float(item.x, item.y, `${AMMO_NAME[item.kind]} +${amount}`, "#e0a24a");
        sfx.pickup();
      }
      this.score += 20;
    }
  }

  private stepFx(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.spin) q.rot = (q.rot ?? 0) + q.spin * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  private touchCheckpoints(): void {
    const p = this.player;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h;
    this.stage.checkpoints.forEach((cp, i) => {
      const dx = cx - (cp.x + PLAYER_W / 2);
      const dy = cy - (cp.y + PLAYER_H);
      if (i > this.checkpoint && dx * dx + dy * dy < 36 * 36) {
        this.checkpoint = i;
        this.banner = "CHECKPOINT";
        this.bannerT = 0.9;
      }
    });
  }

  private touchExit(): void {
    if (this.finished) return;
    if (!aabb(this.player, this.stage.exit)) return;
    this.finished = true;
    this.clearBonus = 500;
    this.timeBonus = Math.max(0, Math.round((140 - this.time) * 12));
    this.score += this.clearBonus + this.timeBonus;
    if (this.score > this.best) {
      this.best = this.score;
      writeBest(this.best);
    }
    this.mode = "clear";
    this.banner = "SHAFT CLEAR";
    this.bannerT = 2;
    sfx.clear();
  }

  updateCamera(dt: number, viewW: number, viewH: number): void {
    const p = this.player;
    const portrait = viewW < viewH;
    let targetX: number;
    let targetY: number;
    if (this.mode === "menu") {
      targetX = portrait ? p.x + p.w / 2 - viewW / 2 : p.x + p.w / 2 - viewW * 0.66;
      targetY = portrait ? p.y - viewH * 0.22 : p.y + p.h / 2 - viewH * 0.46;
    } else {
      const look = p.facing * 34;
      targetX = p.x + p.w / 2 + look - viewW / 2;
      targetY = p.y + p.h * 0.4 - viewH * 0.46;
    }
    const maxX = Math.max(0, this.stage.w * 16 - viewW);
    const maxY = Math.max(0, this.stage.h * 16 - viewH);
    targetX = Math.max(0, Math.min(maxX, targetX));
    targetY = Math.max(0, Math.min(maxY, targetY));
    if (!this.camReady) {
      this.cam.x = targetX;
      this.cam.y = targetY;
      this.camReady = true;
    } else {
      const k = 1 - Math.exp(-9 * dt);
      this.cam.x += (targetX - this.cam.x) * k;
      this.cam.y += (targetY - this.cam.y) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 16);
  }
}
