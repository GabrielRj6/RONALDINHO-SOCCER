import { CFG, TEAM, PSTATE } from "./config.js";
import { clamp, rand } from "./utils.js";

const F = CFG.field;
const P = CFG.player;
const B = CFG.ball;

const BOX_D = 189;
const BOX_H = 461;
const GA_D = 63;
const GA_H = 208;
const PEN_SPOT = 126;
const ARC_R = 91;
const ARC_A = Math.acos(Math.min(1, (BOX_D - PEN_SPOT) / ARC_R));

const STRIPE_A = "#219b57";
const STRIPE_B = "#1c8d4e";
const LINE = "rgba(255,255,255,0.9)";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cam = { x: F.w / 2, y: F.h / 2, s: 0.8 };
    this.shake = 0;
    this.particles = [];
    this.spin = 0;
    this.plane = null;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.dpr = dpr;
    this.W = w;
    this.H = h;
  }

  kick(x, y, power) {
    this.puff(x, y, 6 + power * 8, "rgba(255,255,255,0.7)");
  }

  puff(x, y, size, color) {
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(20, 90);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: rand(0.25, 0.5),
        size: rand(size * 0.4, size),
        color,
        grav: 0,
        shape: "dot",
      });
    }
  }

  dust(x, y) {
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      this.particles.push({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: Math.cos(a) * rand(10, 50),
        vy: Math.sin(a) * rand(10, 50),
        life: 0,
        maxLife: rand(0.3, 0.55),
        size: rand(3, 7),
        color: "rgba(230,230,210,0.7)",
        grav: 0,
        shape: "dot",
      });
    }
  }

  sparks(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 240);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: rand(0.2, 0.45),
        size: rand(2, 4),
        color,
        grav: 260,
        shape: "dot",
      });
    }
  }

  confetti(x, y, color) {
    for (let i = 0; i < 70; i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(120, 460);
      this.particles.push({
        x: x + rand(-30, 30),
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: rand(0.9, 1.8),
        size: rand(4, 9),
        color: [color, "#ffffff", "#ffd166", "#90e0a8"][(Math.random() * 4) | 0],
        grav: 420,
        shape: "conf",
        rot: rand(0, 6),
        vr: rand(-8, 8),
      });
    }
  }

  explosion(x, y, r) {
    this.shake = Math.max(this.shake, 30);
    const cols = ["#fff3b0", "#ffb703", "#fb8500", "#ef476f", "#ffffff"];
    for (let i = 0; i < 60; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(80, 520);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: rand(0.35, 0.9),
        size: rand(3, 10),
        color: cols[(Math.random() * cols.length) | 0],
        grav: 300,
        shape: Math.random() < 0.4 ? "conf" : "dot",
        rot: rand(0, 6),
        vr: rand(-8, 8),
      });
    }
    this.puff(x, y, 40, "rgba(255,180,80,0.6)");
  }

  spawnEvents(events) {
    if (!events) return;
    for (const ev of events) {
      switch (ev.k) {
        case "stuka":
          this.plane = {
            t: 0,
            dur: ev.dur,
            sx: ev.sx,
            sy: ev.sy,
            px: ev.px,
            py: ev.py,
            tx: ev.tx,
            ty: ev.ty,
          };
          break;
        case "boom":
          this.explosion(ev.x, ev.y, ev.r);
          break;
        case "goal":
          this.shake = Math.max(this.shake, 22);
          this.confetti(ev.x, ev.y, TEAM[ev.team].color);
          break;
        case "kick":
          this.kick(ev.x, ev.y, ev.power);
          break;
        case "tackle":
        case "slidehit":
          this.shake = Math.max(this.shake, 7);
          this.sparks(ev.x, ev.y, "#ffe27a");
          break;
        case "steal":
          this.sparks(ev.x, ev.y, "#ffffff");
          break;
        case "land":
          this.dust(ev.x, ev.y);
          break;
        case "jump":
          this.puff(ev.x, ev.y, 5, "rgba(255,255,255,0.5)");
          break;
        case "save":
          this.sparks(ev.x, ev.y, TEAM.a.gk);
          break;
        case "wall":
          if (ev.sp > 300) this.puff(ev.x, ev.y, 5, "rgba(255,255,255,0.5)");
          break;
        default:
          break;
      }
    }
  }

  updateFx(dt) {
    this.shake *= Math.exp(-6 * dt);
    if (this.shake < 0.2) this.shake = 0;
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        ps.splice(i, 1);
        continue;
      }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    if (ps.length > 500) ps.splice(0, ps.length - 500);
  }

  updateCam(view, dt) {
    const bx = view.ball ? view.ball.x : F.w / 2;
    const by = view.ball ? view.ball.y : F.h / 2;
    const targetS = clamp(this.H / 1000, 0.42, 1.1);
    this.cam.s += (targetS - this.cam.s) * Math.min(1, 3 * dt);
    const k = 1 - Math.exp(-3.4 * dt);
    this.cam.x += (bx - this.cam.x) * k;
    this.cam.y += (by - this.cam.y) * k;
    const hw = this.W / (2 * this.cam.s);
    const hh = this.H / (2 * this.cam.s);
    const m = 170;
    if (hw * 2 >= F.w + m * 2) this.cam.x = F.w / 2;
    else this.cam.x = clamp(this.cam.x, hw - m, F.w - hw + m);
    if (hh * 2 >= F.h + m * 2) this.cam.y = F.h / 2;
    else this.cam.y = clamp(this.cam.y, hh - m, F.h - hh + m);
  }

  draw(view, dt, now) {
    this.updateFx(dt);
    this.updateCam(view, dt);
    const ctx = this.ctx;
    const s = this.cam.s;
    const sx = this.shake ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake ? rand(-this.shake, this.shake) : 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#0a0f1e";
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.save();
    ctx.translate(this.W / 2 + sx, this.H / 2 + sy);
    ctx.scale(s, s);
    ctx.translate(-this.cam.x, -this.cam.y);

    this.drawField(ctx);
    const ball = view.ball;
    if (ball) this.drawShadow(ctx, ball.x, ball.y, B.r, ball.z, 0.4);

    const players = [...view.players].sort((a, b) => a.y - b.y || a.z - b.z);
    for (const p of players) this.drawShadow(ctx, p.x, p.y, P.r, p.z, 0.35);
    for (const p of players) this.drawPlayer(ctx, p, view, now);
    if (ball) this.drawBall(ctx, ball, dt);
    this.drawParticles(ctx);
    this.drawPlane(ctx, dt);

    ctx.restore();
    this.drawVignette(ctx);
    if (view.players.length) this.drawMinimap(ctx, view);
    this.drawStamina(ctx, view);
  }

  drawField(ctx) {
    ctx.fillStyle = "#101728";
    ctx.fillRect(-220, -220, F.w + 440, F.h + 440);

    ctx.fillStyle = "#0d1424";
    ctx.fillRect(-160, -160, F.w + 320, F.h + 320);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, F.w, F.h);
    ctx.clip();
    const stripeW = 100;
    for (let x = 0; x < F.w; x += stripeW) {
      ctx.fillStyle = (x / stripeW) % 2 === 0 ? STRIPE_A : STRIPE_B;
      ctx.fillRect(x, 0, stripeW, F.h);
    }
    const gl = ctx.createLinearGradient(0, 0, 0, F.h);
    gl.addColorStop(0, "rgba(255,255,255,0.06)");
    gl.addColorStop(0.5, "rgba(255,255,255,0)");
    gl.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, F.w, F.h);
    ctx.restore();

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, F.w - 4, F.h - 4);
    ctx.beginPath();
    ctx.moveTo(F.w / 2, 2);
    ctx.lineTo(F.w / 2, F.h - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(F.w / 2, F.h / 2, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = LINE;
    ctx.beginPath();
    ctx.arc(F.w / 2, F.h / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    const y0 = (F.h - BOX_H) / 2;
    ctx.strokeRect(2, y0, BOX_D, BOX_H);
    ctx.strokeRect(F.w - BOX_D - 2, y0, BOX_D, BOX_H);
    const gy0 = (F.h - GA_H) / 2;
    ctx.strokeRect(2, gy0, GA_D, GA_H);
    ctx.strokeRect(F.w - GA_D - 2, gy0, GA_D, GA_H);

    ctx.beginPath();
    ctx.arc(PEN_SPOT, F.h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(F.w - PEN_SPOT, F.h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(PEN_SPOT, F.h / 2, ARC_R, -ARC_A, ARC_A);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(F.w - PEN_SPOT, F.h / 2, ARC_R, Math.PI - ARC_A, Math.PI + ARC_A);
    ctx.stroke();

    this.drawGoal(ctx, 0, 1);
    this.drawGoal(ctx, F.w, -1);

    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.strokeRect(3, 3, F.w - 6, F.h - 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(120,220,255,0.35)";
    ctx.strokeRect(-8, -8, F.w + 16, F.h + 16);
  }

  drawGoal(ctx, gx, dir) {
    const x0 = dir === 1 ? gx - F.goalDepth : gx;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x0, F.goalTop, F.goalDepth, F.goalBottom - F.goalTop);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.5;
    const gd = F.goalDepth;
    const gh = F.goalBottom - F.goalTop;
    ctx.beginPath();
    for (let c = -gh; c < gd; c += 16) {
      const x1 = x0 + Math.max(0, c);
      const y1 = F.goalTop + Math.max(0, -c);
      const x2 = x0 + Math.min(gd, c + gh);
      const y2 = F.goalTop + (Math.min(gd, c + gh) - c);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, F.goalTop, F.goalDepth, F.goalBottom - F.goalTop);
    ctx.fillStyle = "#ffffff";
    for (const py of [F.goalTop, F.goalBottom]) {
      ctx.beginPath();
      ctx.arc(gx, py, F.postR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  drawShadow(ctx, x, y, r, z, alpha) {
    const k = clamp(1 - z / 340, 0.45, 1);
    ctx.fillStyle = `rgba(0,0,0,${alpha * k})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * k, r * 0.7 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlayer(ctx, p, view, now) {
    const t = TEAM[p.team];
    const visY = p.y - p.z * 0.55;
    const k = 1 + p.z / 600;
    ctx.save();
    ctx.translate(p.x, visY);
    ctx.scale(k, k);

    const isLocal = p.id === view.localId;
    if (isLocal) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, P.r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (p.turbo > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 90);
      ctx.strokeStyle = "rgba(125,211,252," + (0.45 + 0.4 * pulse).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, P.r + 10 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    const body = p.role === "gk" ? t.gk : t.color;
    const outline = p.role === "gk" ? "#3f3f10" : t.dark;

    if (p.state === PSTATE.slide || p.state === PSTATE.stun || p.state === PSTATE.fly) {
      ctx.save();
      ctx.rotate(p.state === PSTATE.stun ? p.facing + Math.PI / 2 : p.facing);
      const rx = p.state === PSTATE.slide ? 24 : p.state === PSTATE.fly ? 28 : 20;
      ctx.fillStyle = body;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (p.state === PSTATE.stun) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.save();
        ctx.rotate(-(p.facing + Math.PI / 2));
        ctx.fillText("~", 0, -16);
        ctx.restore();
      } else if (p.state === PSTATE.fly) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.ellipse(rx - 2, 0, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(rx - 4, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = body;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, P.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const hx = Math.cos(p.facing) * 6;
      const hy = Math.sin(p.facing) * 6;
      ctx.fillStyle = "#ffe9d2";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const ex = Math.cos(p.facing) * 10;
      const ey = Math.sin(p.facing) * 10;
      const px = -Math.sin(p.facing) * 3.4;
      const py = Math.cos(p.facing) * 3.4;
      ctx.fillStyle = "#20242e";
      ctx.beginPath();
      ctx.arc(ex + px, ey + py, 1.7, 0, Math.PI * 2);
      ctx.arc(ex - px, ey - py, 1.7, 0, Math.PI * 2);
      ctx.fill();

      if (p.state === PSTATE.hold) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, P.r + 4, p.facing - 0.9, p.facing + 0.9);
        ctx.stroke();
      }

      if (p.state === PSTATE.punch) {
        const fx = Math.cos(p.facing) * (P.r + 8);
        const fy = Math.sin(p.facing) * (P.r + 8);
        ctx.fillStyle = "#ffe9d2";
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx, fy, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    if (p.charge > 0.02) {
      const w = 44;
      const hgt = 7;
      const y = -P.r - 22;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.roundRect(-w / 2, y, w, hgt, 3);
      ctx.fill();
      const col = p.charge < 0.5 ? "#7ef0a0" : p.charge < 0.8 ? "#ffd166" : "#ff6b6b";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(-w / 2, y, w * p.charge, hgt, 3);
      ctx.fill();
    }

    ctx.restore();

    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.fillStyle = "#ffffff";
    const label = p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name;
    const ty = visY - P.r - (p.charge > 0.02 ? 30 : 14);
    ctx.strokeText(label, p.x, ty);
    ctx.fillText(label, p.x, ty);
    if (p.role === "gk") {
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.fillStyle = t.gk;
      ctx.strokeText("GOL", p.x, ty - 12);
      ctx.fillText("GOL", p.x, ty - 12);
    }
  }

  drawBall(ctx, ball, dt) {
    const r = B.r * (1 + ball.z / 500);
    const vy = ball.y - ball.z * 0.55;
    const sp = Math.hypot(ball.vx, ball.vy);
    this.spin += (sp / 200) * dt + dt * 1.2;
    ctx.save();
    ctx.translate(ball.x, vy);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(20,20,30,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#22262f";
    for (let i = 0; i < 5; i++) {
      const a = this.spin + (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = clamp(t, 0, 1);
      ctx.fillStyle = p.color;
      if (p.shape === "conf") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPlane(ctx, dt) {
    const pl = this.plane;
    if (!pl) return;
    pl.t += dt;
    if (pl.t >= pl.dur) {
      this.plane = null;
      return;
    }
    const u = pl.t / pl.dur;
    const iu = 1 - u;
    const x = iu * iu * pl.sx + 2 * iu * u * pl.px + u * u * pl.tx;
    const y = iu * iu * pl.sy + 2 * iu * u * pl.py + u * u * pl.ty;
    const dx = 2 * iu * (pl.px - pl.sx) + 2 * u * (pl.tx - pl.px);
    const dy = 2 * iu * (pl.py - pl.sy) + 2 * u * (pl.ty - pl.py);
    const ang = Math.atan2(dy, dx);
    const alt = (1 - u) * 260 + 34;
    this.drawShadow(ctx, x, y, 26, alt, 0.22);
    ctx.save();
    ctx.translate(x, y - alt * 0.4);
    ctx.rotate(ang);
    ctx.fillStyle = "#4b5563";
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.lineTo(-6, -24);
    ctx.lineTo(-16, -21);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.lineTo(-6, 24);
    ctx.lineTo(-16, 21);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6b7280";
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(-18, -8);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#374151";
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-23, -11);
    ctx.lineTo(-25, 0);
    ctx.lineTo(-23, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(10, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (u > 0.78) {
      const bf = (u - 0.78) / 0.22;
      const bx = x + (pl.tx - x) * bf;
      const by = y + (pl.ty - y) * bf;
      const bz = alt * (1 - bf);
      this.drawShadow(ctx, bx, by, 5, bz, 0.3);
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.ellipse(bx, by - bz * 0.4, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawVignette(ctx) {
    const g = ctx.createRadialGradient(
      this.W / 2,
      this.H / 2,
      Math.min(this.W, this.H) * 0.35,
      this.W / 2,
      this.H / 2,
      Math.max(this.W, this.H) * 0.75
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  drawMinimap(ctx, view) {
    const mw = 210;
    const sc = mw / (F.w + 120);
    const mh = (F.h + 120) * sc;
    const x0 = this.W - mw - 18;
    const y0 = this.H - mh - 18;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(5,8,16,0.72)";
    ctx.beginPath();
    ctx.roundRect(x0 - 6, y0 - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const mx = (x) => x0 + 60 * sc + x * sc;
    const my = (y) => y0 + 60 * sc + y * sc;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.strokeRect(mx(0), my(0), F.w * sc, F.h * sc);
    ctx.beginPath();
    ctx.moveTo(mx(F.w / 2), my(0));
    ctx.lineTo(mx(F.w / 2), my(F.h));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx(F.w / 2), my(F.h / 2), 90 * sc, 0, Math.PI * 2);
    ctx.stroke();
    for (const p of view.players) {
      ctx.fillStyle = p.role === "gk" ? TEAM[p.team].gk : TEAM[p.team].color;
      ctx.beginPath();
      ctx.arc(mx(p.x), my(p.y), p.id === view.localId ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === view.localId) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (view.ball) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(mx(view.ball.x), my(view.ball.y), 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawStamina(ctx, view) {
    const me = view.players.find((p) => p.id === view.localId);
    if (!me) return;
    const w = 190;
    const h = 11;
    const x = 18;
    const y = this.H - 34;
    ctx.save();
    ctx.fillStyle = "rgba(5,8,16,0.7)";
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    const frac = clamp(me.stamina / CFG.player.staminaMax, 0, 1);
    ctx.fillStyle = frac > 0.35 ? "#6ee7a0" : frac > 0.15 ? "#ffd166" : "#ff6b6b";
    ctx.beginPath();
    ctx.roundRect(x, y, w * frac, h, 4);
    ctx.fill();
    ctx.font = "bold 9px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "left";
    ctx.fillText("FÔLEGO", x + 2, y - 7);
    ctx.restore();
  }
}
