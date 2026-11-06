/** Tiny synthesized cues, plus sampled pickup sounds. Unlocked on the first gesture so iOS will play them. */

import ammoUrl from "@/game/metal-flick-reload.wav";
import medikitUrl from "@/game/medikit-pickup.wav";
import shotgunUrl from "@/game/shotgun-fire.wav";
import launchUrl from "@/game/grenade-launch.wav";
import smgUrl from "@/game/smg-fire.wav";
import explodeUrl from "@/game/grenade-explode.wav";
import pistolUrl from "@/game/pistol-fire.wav";
import mutant1Url from "@/game/mutant1-hit.wav";
import mutant2Url from "@/game/mutant2-hit.wav";
import ambienceUrl from "@/game/ambience.wav";

let ctx: AudioContext | null = null;

type Sample = {
  url: string;
  buf: AudioBuffer | null;
  loading: Promise<void> | null;
  pending: boolean;
  gain: number;
  offset: number;
};

function makeSample(url: string, gain: number, offset = 0): Sample {
  return { url, buf: null, loading: null, pending: false, gain, offset };
}

const ammoSample = makeSample(ammoUrl, 0.85);
const medikitSample = makeSample(medikitUrl, 0.85);
const shotgunSample = makeSample(shotgunUrl, 0.595);
const launchSample = makeSample(launchUrl, 0.595);
const smgSample = makeSample(smgUrl, 0.5);
const explodeSample = makeSample(explodeUrl, 0.75, 0.13);
const pistolSample = makeSample(pistolUrl, 0.6);
const mutant1Sample = makeSample(mutant1Url, 0.9);
const mutant2Sample = makeSample(mutant2Url, 0.7, 0.36);

const mutantGate = { mutant: 0, mutant2: 0 };

const SMG_LOOP_FROM = 0.12;
const SMG_LOOP_TO = 0.7;
const SMG_LOOP_FADE = 0.02;

let smgNode: AudioBufferSourceNode | null = null;
let smgGain: GainNode | null = null;
let smgLoop: AudioBuffer | null = null;

const AMBIENCE_GAIN = 0.6;
let ambienceBuf: AudioBuffer | null = null;
let ambienceLoading: Promise<void> | null = null;
let ambienceStarted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function loadSample(sample: Sample): Promise<void> {
  if (sample.buf) return Promise.resolve();
  if (sample.loading) return sample.loading;
  const audio = ac();
  if (!audio) return Promise.resolve();
  sample.loading = fetch(sample.url)
    .then((r) => r.arrayBuffer())
    .then((b) => audio.decodeAudioData(b))
    .then((buf) => {
      sample.buf = buf;
    })
    .catch(() => {
      sample.loading = null;
    });
  return sample.loading;
}

function playBuffer(buf: AudioBuffer, gain: number, offset = 0): void {
  const audio = ac();
  if (!audio) return;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const g = audio.createGain();
  g.gain.setValueAtTime(gain, audio.currentTime);
  src.connect(g);
  g.connect(audio.destination);
  src.start(audio.currentTime, offset);
}

function smgLoopBuffer(buf: AudioBuffer): AudioBuffer {
  if (smgLoop) return smgLoop;
  const audio = ac();
  if (!audio) return buf;
  const sr = buf.sampleRate;
  const a = Math.floor(SMG_LOOP_FROM * sr);
  const b = Math.floor(SMG_LOOP_TO * sr);
  const fade = Math.floor(SMG_LOOP_FADE * sr);
  const len = b - a - fade;
  const out = audio.createBuffer(buf.numberOfChannels, len, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[a + i] ?? 0;
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      dst[i] = (src[a + i] ?? 0) * t + (src[b - fade + i] ?? 0) * (1 - t);
    }
  }
  smgLoop = out;
  return out;
}

function startSmg(): void {
  const audio = ac();
  if (!audio) return;
  if (smgNode) return;
  if (!smgSample.buf) {
    smgSample.pending = true;
    void loadSample(smgSample).then(() => {
      if (!smgSample.pending || !smgSample.buf) return;
      smgSample.pending = false;
      startSmg();
    });
    return;
  }
  const src = audio.createBufferSource();
  src.buffer = smgLoopBuffer(smgSample.buf);
  src.loop = true;
  const g = audio.createGain();
  g.gain.setValueAtTime(smgSample.gain, audio.currentTime);
  src.connect(g);
  g.connect(audio.destination);
  src.start();
  smgNode = src;
  smgGain = g;
  src.onended = () => {
    if (smgNode === src) {
      smgNode = null;
      smgGain = null;
    }
  };
}

function stopSmg(): void {
  if (!smgNode || !smgGain) {
    smgSample.pending = false;
    return;
  }
  const audio = ac();
  const src = smgNode;
  const g = smgGain;
  smgNode = null;
  smgGain = null;
  smgSample.pending = false;
  if (!audio) {
    try { src.stop(); } catch { /* already stopped */ }
    return;
  }
  const t = audio.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0.0001, t + 0.04);
  try { src.stop(t + 0.05); } catch { /* already stopped */ }
}

function playGated(sample: Sample, kind: "mutant" | "mutant2"): void {
  const audio = ac();
  if (!audio) return;
  if (audio.currentTime < mutantGate[kind]) return;
  if (!sample.buf) {
    if (sample.pending) return;
    sample.pending = true;
    void loadSample(sample).then(() => {
      sample.pending = false;
      if (sample.buf) playGated(sample, kind);
    });
    return;
  }
  playBuffer(sample.buf, sample.gain, sample.offset);
  mutantGate[kind] = audio.currentTime + Math.max(0.05, sample.buf.duration - sample.offset);
}

function playSample(sample: Sample): void {
  const audio = ac();
  if (!audio) return;
  if (sample.buf) {
    playBuffer(sample.buf, sample.gain, sample.offset);
    return;
  }
  sample.pending = true;
  void loadSample(sample).then(() => {
    if (!sample.pending || !sample.buf) return;
    sample.pending = false;
    playBuffer(sample.buf, sample.gain, sample.offset);
  });
}

function startAmbience(): void {
  const audio = ac();
  if (!audio || ambienceStarted) return;
  ambienceStarted = true;
  const begin = (buf: AudioBuffer) => {
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = audio.createGain();
    const t = audio.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(AMBIENCE_GAIN, t + 1.2);
    src.connect(g);
    g.connect(audio.destination);
    src.start();
  };
  if (ambienceBuf) {
    begin(ambienceBuf);
    return;
  }
  if (!ambienceLoading) {
    ambienceLoading = fetch(ambienceUrl)
      .then((r) => r.arrayBuffer())
      .then((b) => audio.decodeAudioData(b))
      .then((buf) => {
        ambienceBuf = buf;
      })
      .catch(() => {
        ambienceLoading = null;
        ambienceStarted = false;
      });
  }
  void ambienceLoading.then(() => {
    if (ambienceBuf) begin(ambienceBuf);
  });
}

export function unlockAudio(): void {
  ac();
  void loadSample(ammoSample);
  void loadSample(medikitSample);
  void loadSample(shotgunSample);
  void loadSample(launchSample);
  void loadSample(smgSample);
  void loadSample(explodeSample);
  void loadSample(pistolSample);
  void loadSample(mutant1Sample);
  void loadSample(mutant2Sample);
  startAmbience();
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  slide = 0,
): void {
  const audio = ac();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, hp = 800): void {
  const audio = ac();
  if (!audio) return;
  const t = audio.currentTime;
  const n = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filter = audio.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = audio.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(audio.destination);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  jump: () => tone(220, 0.09, "square", 0.04, 180),
  shoot: () => playSample(pistolSample),
  shotgun: () => playSample(shotgunSample),
  launch: () => playSample(launchSample),
  smg: () => startSmg(),
  smgStop: () => stopSmg(),
  grenade: () => playSample(explodeSample),
  hit: () => tone(180, 0.06, "square", 0.04, -100),
  mutant1: () => playGated(mutant1Sample, "mutant"),
  mutant2: () => playGated(mutant2Sample, "mutant2"),
  hurt: () => {
    tone(140, 0.14, "sawtooth", 0.05, -90);
    noise(0.08, 0.04, 300);
  },
  pickup: () => playSample(ammoSample),
  medikit: () => playSample(medikitSample),
  dry: () => tone(90, 0.04, "square", 0.03),
  clear: () => {
    tone(440, 0.1, "square", 0.04);
    tone(660, 0.16, "square", 0.04);
  },
};
