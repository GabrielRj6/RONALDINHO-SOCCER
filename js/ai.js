import { CFG, BITS, PSTATE } from "./config.js";
import { clamp, rand, angDiff } from "./utils.js";

const F = CFG.field;
const P = CFG.player;
const B = CFG.ball;
const G = CFG.gk;

const GOAL = { a: { x: F.w, y: F.h / 2 }, b: { x: 0, y: F.h / 2 } };
const OWN = { a: { x: 0, y: F.h / 2 }, b: { x: F.w, y: F.h / 2 } };
const ATK = { a: 1, b: -1 };

function moveBits(tx, ty, p, sprintDist = 110) {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  let bits = 0;
  if (dx > 7) bits |= BITS.right;
  else if (dx < -7) bits |= BITS.left;
  if (dy > 7) bits |= BITS.down;
  else if (dy < -7) bits |= BITS.up;
  if (d > sprintDist && bits) bits |= BITS.sprint;
  return bits;
}

export function createBot(home) {
  return { home, h: 0, k: 0, s: 0 };
}

function gkBits(w, p, mem) {
  const b = w.ball;
  const boxEdge = p.team === "a" ? G.boxX + 70 : F.w - G.boxX - 70;
  const inDanger =
    (p.team === "a" ? b.x < boxEdge : b.x > boxEdge) &&
    b.y > F.goalTop - 120 &&
    b.y < F.goalBottom + 120;
  let tx;
  let ty;
  if (inDanger && (!b.owner || b.owner === p.id || w.find(b.owner)?.team !== p.team)) {
    tx = b.x;
    ty = b.y;
  } else {
    tx = OWN[p.team].x + (p.team === "a" ? 30 : -30);
    ty = clamp(F.h / 2 + (b.y - F.h / 2) * 0.8, F.goalTop + 16, F.goalBottom - 16);
  }
  let bits = moveBits(tx, ty, p, 70);
  if (p.state === PSTATE.hold) {
    mem.h += 1;
    bits = p.team === "a" ? BITS.right : BITS.left;
    if (mem.h > 34 && mem.h < 72) bits |= BITS.kick;
    if (mem.h >= 72) {
      mem.h = 0;
      bits = p.team === "a" ? BITS.right : BITS.left;
    }
  } else {
    mem.h = 0;
  }
  if (!b.owner && Math.hypot(b.x - p.x, b.y - p.y) < 75 && p.slideCd <= 0 && Math.random() < 0.04) {
    bits |= BITS.slide;
  }
  if (b.z > 40 && Math.hypot(b.x - p.x, b.y - p.y) < 70 && p.z === 0) bits |= BITS.jump;
  return bits;
}

function lineBits(w, p, mem) {
  const b = w.ball;
  const goal = GOAL[p.team];
  let nearest = null;
  let nd = Infinity;
  for (const q of w.players) {
    if (q.team !== p.team || q.role === "gk") continue;
    const d = Math.hypot(q.x - b.x, q.y - b.y);
    if (d < nd) {
      nd = d;
      nearest = q;
    }
  }
  const myBallD = Math.hypot(p.x - b.x, p.y - b.y);
  const isChaser = nearest === p || (nd > 150 && myBallD < 170);

  let bits = 0;
  const owner = b.owner ? w.find(b.owner) : null;

  if (owner === p) {
    const toGoal = Math.atan2(goal.y - p.y, goal.x - p.x);
    const align = Math.abs(angDiff(p.facing, toGoal));
    const dg = Math.hypot(goal.x - p.x, goal.y - p.y);
    if (dg < 440 && align < 0.62) {
      mem.k += 1;
      bits = moveBits(goal.x, goal.y, p, 9999);
      bits |= BITS.kick;
      if (mem.k > 40) {
        mem.k = 0;
        bits &= ~BITS.kick;
      }
    } else {
      mem.k = 0;
      const wobble = Math.sin(performance.now() / 700 + (mem.home ? mem.home.y : 0)) * 60;
      bits = moveBits(goal.x, goal.y + wobble, p, 140);
    }
  } else if (owner && owner.team === p.team) {
    mem.k = 0;
    const lane = mem.home ? (mem.home.y - F.h / 2) * 0.5 : 0;
    const tx = clamp(b.x + ATK[p.team] * 180, 120, F.w - 120);
    const ty = clamp(b.y + lane * 0.7, 120, F.h - 120);
    bits = moveBits(tx, ty, p, 130);
  } else {
    mem.k = 0;
    if (isChaser) {
      const ang = Math.atan2(goal.y - b.y, goal.x - b.x);
      const gx = Math.cos(ang);
      const gy = Math.sin(ang);
      const off = P.r + B.r + 6;
      const rawX = b.x - gx * off;
      const rawY = b.y - gy * off;
      const tx = clamp(rawX, P.r, F.w - P.r);
      const ty = clamp(rawY, P.r, F.h - P.r);
      const outside = Math.abs(tx - rawX) > 1 || Math.abs(ty - rawY) > 1;
      const arrived = Math.hypot(tx - p.x, ty - p.y) < 15;
      if (outside) bits = moveBits(b.x, b.y, p, 60);
      else if (arrived) bits = moveBits(b.x + gx * 70, b.y + gy * 70, p, 10);
      else bits = moveBits(tx, ty, p, 90);
    } else if (mem.home) {
      const tx = clamp(mem.home.x + (b.x - F.w / 2) * 0.42, 110, F.w - 110);
      const ty = clamp(mem.home.y + (b.y - F.h / 2) * 0.42, 110, F.h - 110);
      bits = moveBits(tx, ty, p, 170);
    }
  }

  if (b.z > 45 && myBallD < 75 && p.z === 0) bits |= BITS.jump;

  for (const q of w.players) {
    if (q.team === p.team || q.state !== PSTATE.slide || p.z > 0) continue;
    if (Math.hypot(q.x - p.x, q.y - p.y) < 90) {
      bits |= BITS.jump;
      break;
    }
  }

  if (owner && owner.team !== p.team) {
    mem.s = Math.max(0, mem.s - 1);
    const d = Math.hypot(p.x - owner.x, p.y - owner.y);
    if (d < 125 && p.slideCd <= 0 && mem.s <= 0 && Math.random() < 0.03) {
      bits |= BITS.slide;
      mem.s = 95;
    }
  }
  return bits;
}

export function botBits(w, p, mem) {
  if (p.role === "gk") return gkBits(w, p, mem);
  return lineBits(w, p, mem);
}
