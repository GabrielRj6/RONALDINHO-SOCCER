let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, type, vol, slide, delay = 0) {
  if (!ensure() || muted) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, vol, freq, q = 1, delay = 0) {
  if (!ensure() || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
}

export const Sfx = {
  unlock() {
    ensure();
  },
  toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  },
  isMuted() {
    return muted;
  },
  play(ev) {
    if (!ev || muted) return;
    switch (ev.k) {
      case "kick":
        noise(0.09, 0.5 + ev.power * 0.4, 900 + ev.power * 900, 1);
        tone(140 - ev.power * 40, 0.1, "sine", 0.5, 55);
        break;
      case "throw":
        noise(0.14, 0.4, 1400, 1.4);
        tone(220, 0.09, "triangle", 0.3, 340);
        break;
      case "wall":
        if (ev.sp > 180) {
          noise(0.06, Math.min(0.5, ev.sp / 1400), 600, 1);
          tone(95, 0.07, "sine", 0.25, 60);
        }
        break;
      case "touch":
        noise(0.04, 0.16, 1800, 1);
        break;
      case "save":
        noise(0.12, 0.5, 800, 1.2);
        tone(180, 0.12, "triangle", 0.4, 90);
        break;
      case "catch":
        noise(0.08, 0.35, 700, 1);
        break;
      case "steal":
        noise(0.09, 0.4, 1100, 1.2);
        tone(300, 0.07, "square", 0.2, 160);
        break;
      case "block":
        noise(0.06, 0.3, 800, 1);
        break;
      case "tackle":
      case "slidehit":
        noise(0.22, 0.55, 1500, 0.8);
        tone(90, 0.16, "sawtooth", 0.3, 45);
        break;
      case "jump":
        tone(320, 0.1, "square", 0.14, 620);
        break;
      case "land":
        noise(0.07, 0.3, 500, 1);
        break;
      case "goal":
        noise(0.5, 0.35, 2400, 0.6);
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "square", 0.3, null, i * 0.09));
        tone(131, 0.6, "sawtooth", 0.25, 130, 0.05);
        break;
      case "net":
        noise(0.15, 0.3, 1200, 1);
        [659, 784].forEach((f, i) => tone(f, 0.16, "square", 0.2, null, i * 0.08));
        break;
      case "cd":
        tone(ev.n === 1 ? 880 : 660, 0.12, "square", 0.35);
        break;
      case "go":
        tone(1320, 0.28, "square", 0.4, 1320);
        break;
      case "whistle":
        tone(2100, 0.35, "sine", 0.3, 2400);
        tone(2600, 0.35, "sine", 0.18, 2900);
        break;
      case "over":
        [784, 659, 523, 392].forEach((f, i) => tone(f, 0.3, "square", 0.3, null, i * 0.14));
        break;
      case "lost":
      case "wallnet":
        break;
      default:
        break;
    }
  },
};
