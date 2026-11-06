import { useEffect, useRef, useState } from "react";
import { Pause, Repeat } from "lucide-react";
import { STEP, VIEW_H, WEAPONS } from "@/game/constants";
import { Input } from "@/game/input";
import { draw } from "@/game/render";
import { Game } from "@/game/sim";
import { unlockAudio } from "@/game/audio";

declare global {
  interface Window {
    __controlsTest?: {
      getX: () => number;
      getY: () => number;
      getFacing: () => number;
      getSpeed: () => number;
      getYaw: () => number;
      getAim: () => { x: number; y: number };
      getBullets: () => number;
      setKeys: (codes: string[]) => void;
      setSteer: (v: number) => void;
    };
  }
}

type Summary = { score: number; time: number; best: number; timeBonus: number };

function clock(t: number): { main: string; frac: string } {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  return {
    main: `${m}:${s.toString().padStart(2, "0")}`,
    frac: cs.toString().padStart(2, "0"),
  };
}

export function MonchelGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const inputRef = useRef<Input | null>(null);
  const modeRef = useRef<Game["mode"]>("menu");
  const [mode, setMode] = useState<Game["mode"]>("menu");
  const [summary, setSummary] = useState<Summary>({ score: 0, time: 0, best: 0, timeBonus: 0 });

  const scoreRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const fracRef = useRef<HTMLSpanElement>(null);
  const ammoRef = useRef<HTMLSpanElement>(null);
  const weaponRef = useRef<HTMLSpanElement>(null);
  const roseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const game = new Game();
    const input = new Input();
    gameRef.current = game;
    inputRef.current = input;
    input.attach();

    if (import.meta.env.DEV) {
      window.__controlsTest = {
        getX: () => game.player.x,
        getY: () => game.player.y,
        getFacing: () => game.player.facing,
        getSpeed: () => Math.abs(game.player.vx),
        getYaw: () => (game.player.facing > 0 ? 0 : Math.PI),
        getAim: () => ({ x: game.player.aimX, y: game.player.aimY }),
        getBullets: () => game.bullets.length,
        setKeys: (codes) => input.setProbeKeys(codes),
        setSteer: (v) => input.setProbeSteer(v),
      };
      (window as Window & { __monchel?: Game }).__monchel = game;
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const syncHud = () => {
      const c = clock(game.time);
      if (scoreRef.current) scoreRef.current.textContent = String(Math.floor(game.score)).padStart(6, "0");
      if (timeRef.current) timeRef.current.textContent = c.main;
      if (fracRef.current) fracRef.current.textContent = c.frac;
      const weapon = WEAPONS[game.player.weapon] ?? WEAPONS[0];
      if (weaponRef.current) weaponRef.current.textContent = weapon.name.toUpperCase();
      if (ammoRef.current) {
        ammoRef.current.textContent = weapon.infinite
          ? "∞"
          : String(game.ammo[game.player.weapon] ?? 0).padStart(3, "0");
      }
      const energy = Math.max(0, Math.round(game.player.energy));
      root.querySelectorAll<HTMLElement>("[data-energy]").forEach((el) => {
        el.style.width = `${energy}%`;
        el.dataset.low = energy < 30 ? "1" : "0";
      });
      root.querySelectorAll<HTMLElement>("[data-energy-num]").forEach((el) => {
        el.textContent = String(energy);
      });
      const dots = roseRef.current?.children;
      if (dots) {
        const ang = Math.atan2(game.player.aimY, game.player.aimX);
        const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
        for (let i = 0; i < dots.length; i++) {
          (dots[i] as HTMLElement).dataset.on = Number((dots[i] as HTMLElement).dataset.i) === idx ? "1" : "0";
        }
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      input.poll();
      game.handleUi(input.actions);
      input.consumeUi();
      if (game.mode === "play") {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard < 5) {
          game.fixed(STEP, input.actions);
          input.consumeEdges();
          acc -= STEP;
          guard++;
        }
        if (guard === 5) acc = 0;
      } else {
        acc = 0;
      }

      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(cssW * dpr));
      const bh = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      const viewW = (VIEW_H * cssW) / Math.max(1, cssH);
      game.updateCamera(dt, viewW, VIEW_H);
      const alpha = game.mode === "play" ? Math.min(1, acc / STEP) : 1;
      draw(ctx, game, cssW, cssH, dpr, alpha, input.joy);
      syncHud();
      if (modeRef.current !== game.mode) {
        modeRef.current = game.mode;
        setMode(game.mode);
        if (game.mode === "clear") {
          setSummary({
            score: game.score,
            time: game.time,
            best: game.best,
            timeBonus: game.timeBonus,
          });
        }
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    const blockMenu = (e: Event) => e.preventDefault();
    root.addEventListener("contextmenu", blockMenu);

    return () => {
      cancelAnimationFrame(raf);
      input.detach();
      root.removeEventListener("contextmenu", blockMenu);
      if (import.meta.env.DEV) {
        delete window.__controlsTest;
        delete (window as Window & { __monchel?: Game }).__monchel;
      }
    };
  }, []);

  const begin = () => {
    unlockAudio();
    const game = gameRef.current;
    if (!game) return;
    game.start();
    modeRef.current = game.mode;
    setMode(game.mode);
  };

  const onRootPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-pad]")) return;
    const rect = rootRef.current?.getBoundingClientRect();
    const input = inputRef.current;
    if (!rect || !input) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (e.pointerType === "touch") {
      input.pointerDown(e.pointerId, x, y, rect.width);
      rootRef.current?.setPointerCapture(e.pointerId);
    } else if (e.button === 0 && mode === "play") {
      input.mouseFire = true;
    }
  };

  const onRootPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    inputRef.current?.pointerMove(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onRootPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const input = inputRef.current;
    if (!input) return;
    input.pointerUp(e.pointerId);
    if (e.pointerType !== "touch") input.mouseFire = false;
  };

  const hold =
    (key: "jump" | "fire" | "next") => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const input = inputRef.current;
      if (!input) return;
      input.touch[key] = true;
      e.currentTarget.dataset.down = "1";
      e.currentTarget.setPointerCapture(e.pointerId);
    };

  const release =
    (key: "jump" | "fire" | "next") => (e: React.PointerEvent<HTMLButtonElement>) => {
      const input = inputRef.current;
      if (input) input.touch[key] = false;
      e.currentTarget.dataset.down = "0";
    };

  const shown = clock(summary.time);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 touch-none select-none overflow-hidden bg-void text-bone"
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div
        className={
          mode === "menu"
            ? "invisible"
            : "pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-3 items-start gap-2 px-3 pt-3"
        }
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-start gap-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-alert">SCORE</p>
            <span ref={scoreRef} className="font-mono text-2xl leading-none text-alert">
              000000
            </span>
          </div>
          <div className="hidden w-36 pt-px md:block">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-mono text-xs tracking-widest text-energy">ENERGY</span>
              <span data-energy-num className="font-mono text-xs text-bone">
                100
              </span>
            </div>
            <div className="h-3 border border-line bg-void">
              <div data-energy className="energy-fill" />
            </div>
          </div>
        </div>
        <div className="text-center">
          <span ref={timeRef} className="font-mono text-2xl leading-none text-alert">
            0:00
          </span>
          <span ref={fracRef} className="mt-0.5 block font-mono text-xs text-alert">
            00
          </span>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            data-pad
            aria-label={mode === "paused" ? "Resume" : "Pause"}
            className="pointer-events-auto grid size-11 place-items-center border border-line bg-panel text-bone"
            onClick={() => gameRef.current?.togglePause()}
          >
            <Pause className="size-5" />
          </button>
        </div>
      </div>

      <div className={mode === "menu" || mode === "clear" ? "invisible" : "pointer-events-none absolute bottom-4 left-4 z-10"}>
        <p className="font-mono text-xs tracking-widest text-amber">WEAPON</p>
        <span ref={weaponRef} className="font-display text-xl leading-none">
          SIDEARM
        </span>
        <div className="mt-1 flex items-center gap-3">
          <span ref={ammoRef} className="font-mono text-2xl leading-none text-bone">
            010
          </span>
          <div ref={roseRef} className="rose grid grid-cols-3 gap-1" aria-hidden="true">
            <i data-i="5" />
            <i data-i="6" />
            <i data-i="7" />
            <i data-i="4" />
            <i data-i="-1" />
            <i data-i="0" />
            <i data-i="3" />
            <i data-i="2" />
            <i data-i="1" />
          </div>
        </div>
      </div>

      <div
        className={
          mode === "menu" || mode === "clear"
            ? "invisible"
            : "pointer-events-none absolute right-4 z-10 w-36 md:hidden"
        }
        style={{ bottom: "max(9.5rem, calc(env(safe-area-inset-bottom) + 9.5rem))" }}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-mono text-xs tracking-widest text-energy">ENERGY</span>
          <span data-energy-num className="font-mono text-xs text-bone">
            100
          </span>
        </div>
        <div className="h-3 border border-line bg-void">
          <div data-energy className="energy-fill" />
        </div>
      </div>

      <p
        className="sr-only"
      >
        Move with A and D or the left stick. Aim and climb with W and S. Jump with Space or A. Shoot with J or B, including diagonals.
      </p>

      <div
        className={
          mode === "play" || mode === "paused"
            ? "touch-controls absolute right-4 z-20 flex items-end gap-3"
            : "invisible"
        }
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          data-pad
          aria-label="Jump"
          className="pad-btn grid size-16 place-items-center rounded-full font-display text-2xl"
          onPointerDown={hold("jump")}
          onPointerUp={release("jump")}
          onPointerCancel={release("jump")}
        >
          A
        </button>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            data-pad
            aria-label="Switch weapon"
            className="pad-btn grid size-14 place-items-center rounded-full"
            onPointerDown={hold("next")}
            onPointerUp={release("next")}
            onPointerCancel={release("next")}
          >
            <Repeat className="size-5" />
          </button>
          <button
            type="button"
            data-pad
            aria-label="Shoot"
            className="pad-btn grid size-16 place-items-center rounded-full font-display text-2xl"
            onPointerDown={hold("fire")}
            onPointerUp={release("fire")}
            onPointerCancel={release("fire")}
          >
            B
          </button>
        </div>
      </div>

      {mode === "menu" ? (
        <div className="absolute inset-0 z-30 flex items-end justify-center p-3 sm:items-center sm:justify-end sm:p-10">
          <section className="terminal max-h-full w-full max-w-md overflow-y-auto border border-line">
            <div className="hazard-bar" />
            <div className="flex flex-col gap-4 p-5">
              <p className="font-mono text-xs tracking-widest text-amber">FACILITY NET · SHAFT 01</p>
              <h1 className="font-display text-5xl leading-none font-semibold tracking-tight sm:text-7xl">
                MONCHEL
                <br />
                ESCAPE
              </h1>
              <p className="max-w-sm text-lg leading-snug text-bone">
                Low ceilings. Tight ducts. Something in the works already knows the lock failed.
              </p>
              <ul className="grid gap-1 font-mono text-xs leading-relaxed text-muted">
                <li>Move — A/D, arrows, or the left stick</li>
                <li>Aim and climb — W/S or the stick, including diagonals</li>
                <li>Jump — Space, Z, or A. W aims up. It does not jump.</li>
                <li>Shoot — J, click, or B. Eight directions.</li>
                <li>Weapons — 1–4, Q/E, or the swap button. 9mm, SMG, shotgun, grenades.</li>
                <li>Phone — press the left half. The stick appears under your thumb and vanishes when you let go.</li>
                <li>Pad — stick aims, A jumps, X or RT shoots, bumpers swap guns.</li>
              </ul>
              <button
                type="button"
                className="h-14 bg-amber font-display text-xl tracking-widest text-void uppercase"
                onClick={begin}
              >
                Enter the shaft
              </button>
              <p className="font-mono text-xs text-muted">MX-01 · MAINTENANCE</p>
            </div>
          </section>
        </div>
      ) : null}

      {mode === "paused" ? (
        <div className="absolute inset-0 z-30 grid place-items-center p-4">
          <section className="terminal w-full max-w-sm border border-line p-5">
            <p className="font-mono text-xs tracking-widest text-amber">HOLDING</p>
            <h2 className="mt-1 font-display text-4xl">Paused</h2>
            <p className="mt-2 text-lg text-muted">The duct is still there when you are.</p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="h-12 flex-1 bg-amber font-display text-lg tracking-widest text-void uppercase"
                onClick={() => gameRef.current?.togglePause()}
              >
                Resume
              </button>
              <button
                type="button"
                className="h-12 flex-1 border border-line font-display text-lg tracking-widest uppercase"
                onClick={() => {
                  gameRef.current?.reset();
                  modeRef.current = "play";
                  setMode("play");
                }}
              >
                Reset
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {mode === "clear" ? (
        <div className="absolute inset-0 z-30 grid place-items-center p-4">
          <section className="terminal w-full max-w-sm border border-line">
            <div className="hazard-bar" />
            <div className="p-5">
              <p className="font-mono text-xs tracking-widest text-energy">SHAFT CLEAR</p>
              <h2 className="mt-1 font-display text-4xl">You made the hatch</h2>
              <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
                <dt className="text-muted">Time</dt>
                <dd className="text-right text-bone">
                  {shown.main}.{shown.frac}
                </dd>
                <dt className="text-muted">Time bonus</dt>
                <dd className="text-right text-amber">{summary.timeBonus}</dd>
                <dt className="text-muted">Score</dt>
                <dd className="text-right text-alert">{summary.score}</dd>
                <dt className="text-muted">Best</dt>
                <dd className="text-right">{summary.best}</dd>
              </dl>
              <button
                type="button"
                className="mt-5 h-12 w-full bg-amber font-display text-lg tracking-widest text-void uppercase"
                onClick={() => {
                  gameRef.current?.reset();
                  modeRef.current = "play";
                  setMode("play");
                }}
              >
                Run it again
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
