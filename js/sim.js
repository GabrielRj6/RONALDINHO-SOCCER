import { CFG, BITS, PSTATE } from "./config.js";
import { clamp, rand } from "./utils.js";

const F = CFG.field;
const P = CFG.player;
const B = CFG.ball;
const G = CFG.gk;

export function spawnFor(team, idx) {
  const SPOTS = [[340, 380], [470, 255], [470, 505], [560, 380]];
  if (idx < 0) return team === "a" ? { x: 70, y: F.h / 2 } : { x: F.w - 70, y: F.h / 2 };
  const s = SPOTS[idx % SPOTS.length];
  return team === "a" ? { x: s[0], y: s[1] } : { x: F.w - s[0], y: s[1] };
}

const dzClaim = (b, p) => b.z >= p.z - 8 && b.z <= p.z + 36;
const dzSlide = (b, p) => b.z <= p.z + 26;
const spd = (e) => Math.hypot(e.vx, e.vy);

function clampField(e) {
  e.x = clamp(e.x, P.r, F.w - P.r);
  e.y = clamp(e.y, P.r, F.h - P.r);
}

function clampBox(p) {
  if (p.team === "a") p.x = Math.min(p.x, G.boxX);
  else p.x = Math.max(p.x, F.w - G.boxX);
  p.y = clamp(p.y, F.goalTop - G.boxPad, F.goalBottom + G.boxPad);
}

function releaseBall(w, p, vx, vy, vz, selfCd, otherCd, pop) {
  const b = w.ball;
  b.owner = null;
  b.vx = vx;
  b.vy = vy;
  b.vz = vz;
  for (const q of w.players) q.claimCd = q === p ? selfCd : otherCd;
  if (pop) b.z = Math.max(b.z, 2);
}

function doKick(w, p) {
  const b = w.ball;
  const power = clamp(p.charge, 0.25, 1);
  const cs = Math.cos(p.facing);
  const sn = Math.sin(p.facing);
  const held = p.state === PSTATE.hold;
  const speed = held ? 550 + power * 420 : 480 + power * 560;
  const vz = held ? 140 + power * 240 : power * 200;
  b.owner = null;
  b.vx = cs * speed;
  b.vy = sn * speed;
  b.vz = vz;
  b.z = Math.max(b.z, 1);
  p.claimCd = held ? 0.35 : 0.28;
  p.charge = 0;
  if (held) p.state = PSTATE.normal;
  w.events.push({
    k: held ? "throw" : "kick",
    id: p.id,
    x: p.x,
    y: p.y,
    power,
    team: p.team,
  });
}

export function stepPlayer(w, p, bits, dt, ghost = false) {
  const prev = p.bits;
  p.bits = bits;
  if (p.claimCd > 0) p.claimCd -= dt;
  if (p.slideCd > 0) p.slideCd -= dt;
  if (p.grace > 0) p.grace -= dt;
  if (p.state === PSTATE.hold && w.ball.owner !== p.id) {
    p.state = PSTATE.normal;
    p.charge = 0;
  }

  const jumpEdge = !!(bits & BITS.jump) && !(prev & BITS.jump);
  const slideEdge = !!(bits & BITS.slide) && !(prev & BITS.slide);
  const kickHeld = !!(bits & BITS.kick);
  const kickRelease = !(bits & BITS.kick) && !!(prev & BITS.kick);

  if (p.state === PSTATE.stun) {
    p.stunT -= dt;
    p.charge = 0;
    p.vx *= Math.exp(-5 * dt);
    p.vy *= Math.exp(-5 * dt);
    if (p.stunT <= 0) p.state = PSTATE.normal;
  } else if (p.state === PSTATE.slide) {
    p.slideT -= dt;
    p.vx *= Math.exp(-2.5 * dt);
    p.vy *= Math.exp(-2.5 * dt);
    if (p.slideT <= 0) p.state = PSTATE.normal;
  } else {
    let ix = (bits & BITS.right ? 1 : 0) - (bits & BITS.left ? 1 : 0);
    let iy = (bits & BITS.down ? 1 : 0) - (bits & BITS.up ? 1 : 0);
    const len = Math.hypot(ix, iy);
    if (len > 0) {
      ix /= len;
      iy /= len;
      p.facing = Math.atan2(iy, ix);
    }
    const wantSprint = !!(bits & BITS.sprint) && len > 0 && !p.sprintLock;
    const max = wantSprint ? P.sprint : P.walk;
    if (wantSprint) {
      p.stamina -= P.sprintDrain * dt;
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.sprintLock = true;
      }
    } else {
      p.stamina = Math.min(P.staminaMax, p.stamina + P.regen * dt);
      if (p.sprintLock && p.stamina >= 30) p.sprintLock = false;
    }
    const k = 1 - Math.exp(-P.accel * dt);
    p.vx += (ix * max - p.vx) * k;
    p.vy += (iy * max - p.vy) * k;

    if (p.z === 0 && jumpEdge) {
      p.vz = P.jumpV;
      p.z = 0.01;
      if (!ghost) w.events.push({ k: "jump", id: p.id, x: p.x, y: p.y });
    }

    if (slideEdge && p.slideCd <= 0 && p.z === 0) {
      p.state = PSTATE.slide;
      p.slideT = P.slideTime;
      p.slideCd = P.slideCd;
      p.vx = Math.cos(p.facing) * P.slideSpeed;
      p.vy = Math.sin(p.facing) * P.slideSpeed;
      p.slideHitBall = false;
      p.hitIds = {};
      p.charge = 0;
      if (!ghost && w.ball.owner === p.id) {
        releaseBall(
          w,
          p,
          Math.cos(p.facing) * 350 + p.vx * 0.3,
          Math.sin(p.facing) * 350 + p.vy * 0.3,
          0,
          0.3,
          0.4,
          false
        );
      }
    }

    if (p.state === PSTATE.normal || p.state === PSTATE.hold) {
      if (kickHeld && w.ball.owner === p.id) {
        p.charge = Math.min(1, p.charge + dt / 0.55);
      } else if (kickRelease && p.charge > 0 && w.ball.owner === p.id) {
        if (!ghost) doKick(w, p);
        else p.charge = 0;
      } else if (!kickHeld) {
        p.charge = 0;
      }
      if (w.ball.owner !== p.id && p.charge > 0 && !kickHeld) p.charge = 0;
    }
  }

  if (p.z > 0 || p.vz > 0) {
    p.vz -= P.grav * dt;
    p.z += p.vz * dt;
    if (p.z <= 0) {
      p.z = 0;
      if (p.vz < -60 && !ghost) w.events.push({ k: "land", id: p.id, x: p.x, y: p.y });
      p.vz = 0;
    }
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampField(p);
  if (p.role === "gk") clampBox(p);
}

export function collidePair(a, b) {
  if (Math.abs(a.z - b.z) >= 34) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (d >= min) return;
  if (d < 0.0001) {
    a.x -= min / 2;
    b.x += min / 2;
    return;
  }
  const nx = dx / d;
  const ny = dy / d;
  const push = (min - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const imp = (-(1 + 0.15) * rv) / 2;
    a.vx -= imp * nx;
    a.vy -= imp * ny;
    b.vx += imp * nx;
    b.vy += imp * ny;
  }
}

export class World {
  constructor() {
    this.players = [];
    this.ball = { x: F.w / 2, y: F.h / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null };
    this.phase = "lobby";
    this.timer = CFG.match.time;
    this.cdT = 0;
    this.cdN = 99;
    this.celebT = 0;
    this.score = { a: 0, b: 0 };
    this.events = [];
  }

  find(id) {
    return this.players.find((p) => p.id === id) || null;
  }

  addPlayer({ id, team, role, name }) {
    const lineIdx = this.players.filter((q) => q.team === team && q.role !== "gk").length;
    const s = spawnFor(team, role === "gk" ? -1 : lineIdx);
    const p = {
      id,
      name,
      team,
      role,
      x: s.x,
      y: s.y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      facing: team === "a" ? 0 : Math.PI,
      bits: 0,
      prevBits: 0,
      state: PSTATE.normal,
      stunT: 0,
      slideT: 0,
      slideCd: 0,
      claimCd: 0,
      grace: 0,
      charge: 0,
      holdT: 0,
      stamina: P.staminaMax,
      sprintLock: false,
      slideHitBall: false,
      hitIds: {},
      r: P.r,
    };
    this.players.push(p);
    return p;
  }

  removePlayer(id) {
    const p = this.find(id);
    if (!p) return;
    if (this.ball.owner === id) {
      releaseBall(this, p, p.vx * 0.6, p.vy * 0.6, 60, 0, 0.3, true);
    }
    this.players = this.players.filter((q) => q.id !== id);
  }

  setRole(id, role) {
    const p = this.find(id);
    if (!p || p.role === role) return;
    if (role === "gk") {
      const other = this.players.find((q) => q.team === p.team && q.role === "gk" && q.id !== id);
      if (other) other.role = "line";
    }
    p.role = role;
    if (role !== "gk" && this.ball.owner === id && p.state === PSTATE.hold) {
      releaseBall(this, p, Math.cos(p.facing) * 400, Math.sin(p.facing) * 400, 80, 0.3, 0.4, true);
    }
    if (role !== "gk" && p.state === PSTATE.hold) p.state = PSTATE.normal;
  }

  setTeam(id, team) {
    const p = this.find(id);
    if (!p || p.team === team) return;
    const gkCount = this.players.filter(
      (q) => q.team === team && q.role === "gk" && q.id !== id
    ).length;
    if (p.role === "gk" && gkCount > 0) return;
    p.team = team;
    if (this.ball.owner === id && p.state === PSTATE.hold) {
      releaseBall(this, p, Math.cos(p.facing) * 400, Math.sin(p.facing) * 400, 80, 0.3, 0.4, true);
      p.state = PSTATE.normal;
    }
  }

  teamCount(team) {
    return this.players.filter((q) => q.team === team).length;
  }

  resetBall() {
    const b = this.ball;
    b.x = F.w / 2;
    b.y = F.h / 2;
    b.z = 0;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    b.owner = null;
  }

  kickoff() {
    this.resetBall();
    const counters = { a: 0, b: 0 };
    for (const p of this.players) {
      const idx = p.role === "gk" ? -1 : counters[p.team]++;
      const s = spawnFor(p.team, idx);
      p.x = s.x;
      p.y = s.y;
      p.z = 0;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.facing = p.team === "a" ? 0 : Math.PI;
      p.state = PSTATE.normal;
      p.stunT = 0;
      p.slideT = 0;
      p.slideCd = 0;
      p.claimCd = 0;
      p.grace = 0;
      p.charge = 0;
      p.holdT = 0;
      p.slideHitBall = false;
      p.hitIds = {};
      p.bits = 0;
      p.prevBits = 0;
    }
    this.phase = "countdown";
    this.cdT = CFG.match.cd;
    this.cdN = 99;
  }

  startMatch() {
    this.score.a = 0;
    this.score.b = 0;
    this.timer = CFG.match.time;
    this.kickoff();
  }

  step(inputs) {
    const dt = CFG.tick;
    if (this.phase === "countdown") {
      this.cdT -= dt;
      const n = Math.ceil(this.cdT);
      if (n !== this.cdN) {
        this.cdN = n;
        if (n >= 1 && n <= CFG.match.cd) this.events.push({ k: "cd", n });
      }
      if (this.cdT <= 0) {
        this.phase = "playing";
        this.events.push({ k: "go" });
      }
    } else if (this.phase === "celebrate") {
      this.celebT -= dt;
      if (this.celebT <= 0) this.kickoff();
    } else if (this.phase === "playing") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.phase = "over";
        this.events.push({ k: "over" });
      }
    }
    const frozen = this.phase === "countdown" || this.phase === "celebrate";
    for (const p of this.players) {
      stepPlayer(this, p, frozen ? 0 : inputs[p.id] | 0, dt, false);
    }
    this.stepBall(dt);
    this.collideAll();
    this.checkGoals();
  }

  stepBall(dt) {
    const b = this.ball;
    if (b.owner) {
      const o = this.find(b.owner);
      if (!o) {
        b.owner = null;
      } else if (o.state === PSTATE.stun) {
        releaseBall(this, o, o.vx * 0.5, o.vy * 0.5, 60, 0.5, 0.4, true);
      } else if (o.z > 6) {
        const cs = Math.cos(o.facing);
        const sn = Math.sin(o.facing);
        releaseBall(
          this,
          o,
          cs * 150 + o.vx * 0.5,
          sn * 150 + o.vy * 0.5,
          0,
          0.15,
          0.15,
          false
        );
      }
    }

    const owned = !!b.owner;
    if (owned) {
      const o = this.find(b.owner);
      if (o) {
        if (o.state === PSTATE.hold) {
          o.holdT += dt;
          b.x = o.x + Math.cos(o.facing) * 20;
          b.y = o.y + Math.sin(o.facing) * 20;
          b.z = o.z + 16;
          b.vx = o.vx;
          b.vy = o.vy;
          b.vz = 0;
        } else {
          const tx = clamp(o.x + Math.cos(o.facing) * P.dribbleLead, B.r, F.w - B.r);
          const ty = clamp(o.y + Math.sin(o.facing) * P.dribbleLead, B.r, F.h - B.r);
          b.vx = clamp((tx - b.x) * P.dribbleK, -500, 500);
          b.vy = clamp((ty - b.y) * P.dribbleK, -500, 500);
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z = 0;
          b.vz = 0;
          if (Math.hypot(tx - b.x, ty - b.y) > P.loseR) {
            const s = Math.min(spd(b), 350);
            const a = Math.atan2(b.vy, b.vx);
            releaseBall(
              this,
              o,
              Math.cos(a) * s,
              Math.sin(a) * s,
              0,
              0.25,
              0.3,
              false
            );
            this.events.push({ k: "lost", id: o.id, x: b.x, y: b.y });
          }
        }
      }
      if (b.owner) this.wallsBall(dt, true);
      else this.wallsBall(dt, false);
    } else {
      if (b.z > 0 || b.vz !== 0) b.vz -= B.grav * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -30) b.vz = -b.vz * B.bounceGround;
        else b.vz = 0;
      }
      if (b.z === 0) {
        const s = Math.hypot(b.vx, b.vy);
        if (s > 0) {
          const ns = Math.max(0, s - B.roll * dt);
          b.vx = (b.vx / s) * ns;
          b.vy = (b.vy / s) * ns;
        }
      } else {
        b.vx *= 1 - 0.1 * dt;
        b.vy *= 1 - 0.1 * dt;
      }
      this.wallsBall(dt, false);
      this.claims();
    }

    for (const p of this.players) {
      if (p.state === PSTATE.slide) this.slideContacts(p);
      else if (b.owner && b.owner !== p.id) this.stealAttempt(p);
    }
    if (!b.owner) this.bounces();
  }

  wallsBall(dt, owned) {
    const b = this.ball;
    let hit = 0;
    if (b.y < B.r) {
      b.y = B.r;
      b.vy = -b.vy * B.bounceWall;
      hit = 1;
    } else if (b.y > F.h - B.r) {
      b.y = F.h - B.r;
      b.vy = -b.vy * B.bounceWall;
      hit = 1;
    }
    const mouth = b.y > F.goalTop && b.y < F.goalBottom;
    if (!mouth) {
      if (b.x < B.r) {
        b.x = B.r;
        b.vx = -b.vx * B.bounceWall;
        hit = 1;
      } else if (b.x > F.w - B.r) {
        b.x = F.w - B.r;
        b.vx = -b.vx * B.bounceWall;
        hit = 1;
      }
    } else {
      if (b.x < -F.goalDepth + B.r) {
        b.x = -F.goalDepth + B.r;
        b.vx = -b.vx * 0.25;
        b.vy *= 0.7;
        hit = 2;
      } else if (b.x > F.w + F.goalDepth - B.r) {
        b.x = F.w + F.goalDepth - B.r;
        b.vx = -b.vx * 0.25;
        b.vy *= 0.7;
        hit = 2;
      }
      if (b.x < 0 || b.x > F.w) {
        if (b.y < F.goalTop + B.r) {
          b.y = F.goalTop + B.r;
          b.vy = -b.vy * 0.3;
          hit = 2;
        } else if (b.y > F.goalBottom - B.r) {
          b.y = F.goalBottom - B.r;
          b.vy = -b.vy * 0.3;
          hit = 2;
        }
      }
    }
    const posts = [
      [0, F.goalTop],
      [0, F.goalBottom],
      [F.w, F.goalTop],
      [F.w, F.goalBottom],
    ];
    for (const q of posts) {
      const dx = b.x - q[0];
      const dy = b.y - q[1];
      const d = Math.hypot(dx, dy);
      const min = B.r + F.postR;
      if (d < min && d > 0.0001) {
        const nx = dx / d;
        const ny = dy / d;
        b.x = q[0] + nx * min;
        b.y = q[1] + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + B.bouncePost) * vn * nx;
          b.vy -= (1 + B.bouncePost) * vn * ny;
        }
        hit = Math.max(hit, 1);
      }
    }
    if (owned && hit && b.owner) {
      const o = this.find(b.owner);
      if (o) {
        const s = Math.min(spd(b), 420);
        const a = Math.atan2(b.vy, b.vx);
        releaseBall(this, o, Math.cos(a) * s, Math.sin(a) * s, 0, 0.15, 0.3, false);
        this.events.push({ k: "wall", x: b.x, y: b.y });
      }
    } else if (hit === 1 && !owned) {
      this.events.push({ k: "wall", x: b.x, y: b.y, sp: Math.hypot(b.vx, b.vy) });
    }
  }

  claims() {
    const b = this.ball;
    let best = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.state === PSTATE.slide || p.state === PSTATE.stun || p.claimCd > 0) continue;
      if (!dzClaim(b, p)) continue;
      const rad = P.r + B.r + (p.role === "gk" ? G.catchR : P.claimR);
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < rad && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) return;
    b.owner = best.id;
    best.grace = P.grace;
    if (best.role === "gk") {
      best.state = PSTATE.hold;
      best.holdT = 0;
      this.events.push({
        k: spd(b) > 420 ? "save" : "catch",
        id: best.id,
        x: b.x,
        y: b.y,
      });
    } else {
      this.events.push({ k: "touch", id: best.id, x: b.x, y: b.y });
    }
  }

  stealAttempt(p) {
    const b = this.ball;
    if (p.state === PSTATE.stun || p.claimCd > 0 || p.state === PSTATE.slide) return;
    const o = this.find(b.owner);
    if (!o) return;
    if (o.grace > 0) return;
    if (!dzClaim(b, p)) return;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d > P.r + B.r + 2) return;
    const gkCatch = p.role === "gk" && o.role !== "gk";
    if (!gkCatch && spd(p) <= P.stealSpeed) {
      const nx = d > 0.0001 ? (b.x - p.x) / d : Math.cos(p.facing);
      const ny = d > 0.0001 ? (b.y - p.y) / d : Math.sin(p.facing);
      releaseBall(
        this,
        p,
        nx * 220 + p.vx * 0.4,
        ny * 220 + p.vy * 0.4,
        0,
        0.12,
        0.35,
        false
      );
      this.events.push({ k: "block", id: p.id, x: b.x, y: b.y });
      return;
    }
    if (gkCatch) {
      b.owner = p.id;
      p.state = PSTATE.hold;
      p.holdT = 0;
      p.grace = P.grace;
      o.claimCd = 0.45;
      this.events.push({ k: spd(b) > 300 ? "save" : "catch", id: p.id, x: b.x, y: b.y });
      return;
    }
    const cs = Math.cos(p.facing);
    const sn = Math.sin(p.facing);
    o.claimCd = 0.45;
    releaseBall(
      this,
      p,
      cs * 240 + p.vx * 0.7,
      sn * 240 + p.vy * 0.7,
      20,
      0.1,
      0.4,
      false
    );
    this.events.push({ k: "steal", id: p.id, x: b.x, y: b.y });
  }

  slideContacts(p) {
    const b = this.ball;
    if (!p.slideHitBall && dzSlide(b, p)) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < P.r + B.r + 18) {
        p.slideHitBall = true;
        const cs = Math.cos(p.facing);
        const sn = Math.sin(p.facing);
        const holder = b.owner ? this.find(b.owner) : null;
        if (holder && holder.id !== p.id) holder.claimCd = 0.4;
        releaseBall(
          this,
          p,
          cs * (680 + spd(p) * 0.5) + rand(-90, 90),
          sn * (680 + spd(p) * 0.5) + rand(-90, 90),
          60 + rand(0, 100),
          0.06,
          0.4,
          true
        );
        this.events.push({ k: "slidehit", id: p.id, x: b.x, y: b.y });
      }
    }
    for (const q of this.players) {
      if (q === p || p.hitIds[q.id]) continue;
      if (q.z >= 26) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d >= P.r + P.r + 4) continue;
      p.hitIds[q.id] = 1;
      q.state = PSTATE.stun;
      q.stunT = P.stunTime;
      q.charge = 0;
      const cs = Math.cos(p.facing);
      const sn = Math.sin(p.facing);
      q.vx += cs * 280;
      q.vy += sn * 280;
      if (b.owner === q.id) {
        releaseBall(
          this,
          p,
          cs * 420 + rand(-60, 60),
          sn * 420 + rand(-60, 60),
          50,
          0.06,
          0.4,
          true
        );
      }
      this.events.push({ k: "tackle", id: p.id, vid: q.id, x: q.x, y: q.y });
    }
  }

  bounces() {
    const b = this.ball;
    for (const p of this.players) {
      if (!dzSlide(b, p)) continue;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d = Math.hypot(dx, dy);
      const min = p.r + B.r;
      if (d >= min || d < 0.0001) continue;
      const nx = dx / d;
      const ny = dy / d;
      b.x = p.x + nx * min;
      b.y = p.y + ny * min;
      const rv = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
      if (rv < 0) {
        b.vx -= 1.4 * rv * nx;
        b.vy -= 1.4 * rv * ny;
      }
    }
  }

  collideAll() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) collidePair(ps[i], ps[j]);
      clampField(ps[i]);
      if (ps[i].role === "gk") clampBox(ps[i]);
    }
  }

  checkGoals() {
    const b = this.ball;
    let scorer = null;
    if (b.x + B.r < 0 && b.y > F.goalTop && b.y < F.goalBottom) scorer = "b";
    else if (b.x - B.r > F.w && b.y > F.goalTop && b.y < F.goalBottom) scorer = "a";
    if (!scorer) return;
    if (this.phase === "playing") {
      this.score[scorer] += 1;
      this.phase = "celebrate";
      this.celebT = CFG.match.celebrate;
      this.events.push({ k: "goal", team: scorer, x: b.x, y: b.y });
    } else if (this.phase === "lobby" || this.phase === "over") {
      this.resetBall();
      this.events.push({ k: "net", team: scorer, x: b.x, y: b.y });
    }
  }
}
