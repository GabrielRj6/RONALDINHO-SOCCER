import { CFG, PSTATE, TEAM } from "./config.js";
import { World, stepPlayer, collidePair, spawnFor } from "./sim.js";
import { botBits, createBot } from "./ai.js";
import { Renderer } from "./render.js";
import { HostNet, ClientNet } from "./net.js";
import { Sfx } from "./audio.js";
import { shortId, clamp, angDiff } from "./utils.js";

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const F = CFG.field;
const P = CFG.player;

export class Game {
  constructor(canvas, input, hooks, canvas3d) {
    this.r = new Renderer(canvas);
    this.canvas = canvas;
    this.canvas3d = canvas3d || null;
    this.r3d = null;
    this.use3d = false;
    this.input = input;
    this.h = hooks;
    this.mode = null;
    this.world = null;
    this.net = null;
    this.bots = new Map();
    this.acc = 0;
    this.last = performance.now();
    this.hostTick = 0;
    this.queues = new Map();
    this.lastSeq = new Map();
    this.lastBits = new Map();
    this.evAcc = [];
    this.roster = [];
    this.rosterMap = {};
    this.myId = null;
    this.localP = null;
    this.gw = { events: [], ball: { owner: null } };
    this.sent = [];
    this.seq = 0;
    this.snaps = [];
    this.lastSnap = null;
    this.prevPhase = null;
    this.prevScore = { a: -1, b: -1 };
    this.hostMeta = null;
    this.codeAttempts = 0;
    this.name = "Jogador";
    this.teamNames = { a: TEAM.a.name, b: TEAM.b.name };
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  teardown() {
    if (this.net) {
      try {
        this.net.close();
      } catch (e) {}
    }
    this.net = null;
    this.world = null;
    this.mode = null;
    this.bots.clear();
    this.queues.clear();
    this.lastSeq.clear();
    this.lastBits.clear();
    this.evAcc = [];
    this.localP = null;
    this.sent = [];
    this.seq = 0;
    this.snaps = [];
    this.lastSnap = null;
    this.roster = [];
    this.rosterMap = {};
    this.myId = null;
    this.hostTick = 0;
    this.prevPhase = null;
    this.prevScore = { a: -1, b: -1 };
    this.teamNames = { a: TEAM.a.name, b: TEAM.b.name };
  }

  sanitizeName(n) {
    const s = String(n || "")
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, 14);
    return s || "Jogador";
  }

  rosterList() {
    if (this.mode === "client") return this.roster;
    if (!this.world) return [];
    return this.world.players.map((p) => ({
      id: p.id,
      nm: p.name,
      tm: p.team,
      rl: p.role,
      bot: p.id.startsWith("bot"),
    }));
  }

  emitRoster() {
    this.roster = this.rosterList();
    this.rosterMap = {};
    for (const r of this.roster) this.rosterMap[r.id] = r;
    this.h.onRoster && this.h.onRoster(this.roster, { ...this.teamNames });
  }

  broadcastRoster() {
    this.emitRoster();
    if (this.net && this.mode === "host") {
      this.net.broadcast({
        k: "r",
        list: this.roster.map((x) => ({ ...x })),
        names: { ...this.teamNames },
      });
    }
  }

  startAttract() {
    this.teardown();
    this.attract = true;
    this.mode = "local";
    this.world = new World();
    let n = 0;
    for (const team of ["a", "b"]) {
      let line = 0;
      for (let i = 0; i < 3; i++) {
        const role = i === 0 ? "gk" : "line";
        const id = "bot" + n++;
        const home = spawnFor(team, role === "gk" ? -1 : line);
        if (role !== "gk") line++;
        this.world.addPlayer({ id, team, role, name: "Bot " + n });
        this.bots.set(id, createBot(role === "gk" ? null : home));
      }
    }
    this.input.setBlocked(true);
    this.emitRoster();
    this.prevPhase = "lobby";
  }

  fillPractice() {
    this.ensureBots();
  }

  addBot(team, role) {
    const id = "bot" + Math.random().toString(36).slice(2, 8);
    const lineIdx = this.world.players.filter(
      (p) => p.team === team && p.role !== "gk"
    ).length;
    const home = spawnFor(team, role === "gk" ? -1 : lineIdx);
    const n = this.world.players.filter((p) => p.id.startsWith("bot")).length + 1;
    this.world.addPlayer({
      id,
      team,
      role,
      name: role === "gk" ? "Goleiro" : "Bot " + n,
    });
    this.bots.set(id, createBot(role === "gk" ? null : home));
    return id;
  }

  botIds(team) {
    return this.world.players
      .filter((p) => p.team === team && p.id.startsWith("bot"))
      .map((p) => p.id);
  }

  removeBotFrom(team, role) {
    const onTeam = this.botIds(team);
    if (!onTeam.length) return false;
    const match = this.world.players.find(
      (p) => p.team === team && p.id.startsWith("bot") && p.role === role
    );
    const id = match ? match.id : onTeam[0];
    this.bots.delete(id);
    this.world.removePlayer(id);
    return true;
  }

  ensureBots() {
    for (const team of ["a", "b"]) {
      if (!this.world.players.some((p) => p.team === team && p.role === "gk")) {
        this.addBot(team, "gk");
      }
      let lines = this.world.players.filter(
        (p) => p.team === team && p.role !== "gk"
      ).length;
      while (
        lines < CFG.fill - 1 &&
        this.world.players.filter((p) => p.team === team).length < CFG.perTeam
      ) {
        this.addBot(team, "line");
        lines++;
      }
    }
  }

  startPractice(name, team, role) {
    this.teardown();
    this.attract = false;
    this.name = this.sanitizeName(name);
    this.mode = "local";
    this.world = new World();
    this.world.addPlayer({ id: "me", team, role, name: this.name });
    this.fillPractice();
    this.input.setBlocked(false);
    this.emitRoster();
    this.prevPhase = "lobby";
    this.prevScore = { a: -1, b: -1 };
  }

  hostHandlers() {
    return {
      onReady: () => {
        this.codeAttempts = 0;
        this.h.onRoomReady && this.h.onRoomReady(this.hostMeta.code);
      },
      onIdTaken: () => {
        this.codeAttempts += 1;
        if (this.codeAttempts > 6) {
          this.h.onRoomFail && this.h.onRoomFail("nao foi possivel abrir a sala");
          return;
        }
        const code = shortId();
        this.hostMeta.code = code;
        if (this.net) {
          try {
            this.net.peer.destroy();
          } catch (e) {}
        }
        this.net = new HostNet(code, this.hostHandlers());
      },
      onFatal: () => {
        this.h.onLeft && this.h.onLeft("falha na rede");
      },
      onJoin: (id, m) => {
        if (this.world.players.length >= CFG.maxPlayers) return "sala cheia";
        const nm = this.sanitizeName(m.nm);
        let team = m.tm === "b" ? "b" : "a";
        let rl = m.rl === "gk" ? "gk" : "line";
        const hasRoom = (t) => this.world.teamCount(t) < CFG.perTeam;
        const tryTeam = (t) => {
          if (
            rl === "gk" &&
            this.world.players.some(
              (p) => p.team === t && p.id.startsWith("bot") && p.role === "gk"
            )
          ) {
            this.removeBotFrom(t, "gk");
            return true;
          }
          if (hasRoom(t)) return true;
          if (this.botIds(t).length) {
            this.removeBotFrom(t, rl);
            return true;
          }
          return false;
        };
        if (!tryTeam(team)) {
          const other = team === "a" ? "b" : "a";
          if (tryTeam(other)) team = other;
          else return "sala cheia";
        }
        if (rl === "gk" && this.world.players.some((p) => p.team === team && p.role === "gk")) {
          rl = "line";
        }
        this.world.addPlayer({ id, team, role: rl, name: nm });
        this.queues.set(id, []);
        this.lastSeq.set(id, 0);
        this.lastBits.set(id, 0);
        this.broadcastRoster();
        this.net.send(id, {
          k: "w",
          tid: id,
          list: this.roster.map((x) => ({ ...x })),
          names: { ...this.teamNames },
          ph: this.world.phase,
          tm: this.world.timer,
          sc: [this.world.score.a, this.world.score.b],
        });
        return null;
      },
      onMeta: (id, m) => {
        const p = this.world.find(id);
        if (!p) return;
        if (m.nm !== undefined) p.name = this.sanitizeName(m.nm);
        if (m.tm && (m.tm === "a" || m.tm === "b") && m.tm !== p.team) {
          if (this.world.teamCount(m.tm) >= CFG.perTeam) {
            this.net.send(id, { k: "err", msg: "time cheio" });
          } else {
            this.applyTeam(id, m.tm);
          }
        }
        if (m.rl) {
          const rl = m.rl === "gk" ? "gk" : "line";
          if (
            rl === "gk" &&
            this.world.players.some(
              (q) => q.team === p.team && q.role === "gk" && q.id !== id
            )
          ) {
            this.net.send(id, { k: "err", msg: "ja tem goleiro" });
          } else {
            this.world.setRole(id, rl);
          }
        }
        this.broadcastRoster();
      },
      onInput: (id, s, b) => {
        const q = this.queues.get(id);
        if (!q) return;
        if (typeof s !== "number" || typeof b !== "number") return;
        q.push({ s: s | 0, b: b & 255 });
        if (q.length > 90) q.shift();
      },
      onLeave: (id) => {
        this.world.removePlayer(id);
        this.queues.delete(id);
        this.lastSeq.delete(id);
        this.lastBits.delete(id);
        this.ensureBots();
        this.broadcastRoster();
      },
    };
  }

  startHost(name, code, team, role) {
    this.teardown();
    this.attract = false;
    this.name = this.sanitizeName(name);
    this.mode = "host";
    this.world = new World();
    this.world.addPlayer({ id: "me", team, role, name: this.name });
    this.ensureBots();
    this.hostMeta = { code };
    this.input.setBlocked(false);
    this.emitRoster();
    this.prevPhase = "lobby";
    this.prevScore = { a: -1, b: -1 };
    this.net = new HostNet(code, this.hostHandlers());
  }

  startClient(name, code, team, role) {
    this.teardown();
    this.attract = false;
    this.name = this.sanitizeName(name);
    this.mode = "client";
    this.pendingJoin = { code, team, role };
    this.myId = null;
    this.input.setBlocked(false);
    this.prevPhase = null;
    this.prevScore = { a: -1, b: -1 };
    this.net = new ClientNet(code, {
      onOpen: () => {
        this.net.send({ k: "j", nm: this.name, tm: this.pendingJoin.team, rl: this.pendingJoin.role });
      },
      onFail: (why) => {
        this.h.onRoomFail && this.h.onRoomFail(why);
        this.teardown();
        this.startAttract();
      },
      onClose: (msg) => {
        this.h.onLeft && this.h.onLeft(msg || "conexao perdida");
        this.teardown();
        this.startAttract();
      },
      onMsg: (m) => this.clientMsg(m),
    });
  }

  clientMsg(m) {
    switch (m.k) {
      case "w": {
        this.myId = m.tid;
        this.roster = m.list || [];
        if (m.names) this.teamNames = { a: m.names.a || TEAM.a.name, b: m.names.b || TEAM.b.name };
        for (const r of this.roster) this.rosterMap[r.id] = r;
        const me = this.rosterMap[this.myId];
        if (me) {
          this.localP = this.makeLocal(me);
        }
        this.h.onRoster && this.h.onRoster(this.roster, { ...this.teamNames });
        break;
      }
      case "r": {
        this.roster = (m.list || []).map((x) => ({ bot: false, ...x }));
        if (m.names) this.teamNames = { a: m.names.a || TEAM.a.name, b: m.names.b || TEAM.b.name };
        this.rosterMap = {};
        for (const r of this.roster) this.rosterMap[r.id] = r;
        const me = this.rosterMap[this.myId];
        if (me && this.localP) {
          this.localP.team = me.tm;
          this.localP.role = me.rl;
          this.localP.name = me.nm;
        }
        this.h.onRoster && this.h.onRoster(this.roster, { ...this.teamNames });
        break;
      }
      case "s":
        this.onSnap(m);
        break;
      case "err":
        this.h.onToast && this.h.onToast(m.msg);
        break;
      case "bye":
        this.h.onLeft && this.h.onLeft(m.msg || "sala encerrada");
        this.teardown();
        this.startAttract();
        break;
      default:
        break;
    }
  }

  makeLocal(me) {
    const s = spawnFor(me.tm, me.rl === "gk" ? -1 : 2);
    return {
      id: this.myId,
      name: me.nm,
      team: me.tm,
      role: me.rl,
      x: s.x,
      y: s.y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      facing: me.tm === "a" ? 0 : Math.PI,
      bits: 0,
      prevBits: 0,
      state: PSTATE.normal,
      stunT: 0,
      slideT: 0,
      slideCd: 0,
      claimCd: 0,
      punchT: 0,
      punchCd: 0,
      punchHitIds: {},
      flyT: 0,
      flyCd: 0,
      flyHitIds: {},
      grace: 0,
      charge: 0,
      holdT: 0,
      stamina: P.staminaMax,
      special: 0,
      turbo: 0,
      sprintLock: false,
      slideHitBall: false,
      hitIds: {},
      r: P.r,
    };
  }

  onSnap(m) {
    const arr = performance.now();
    this.lastSnap = m;
    this.snaps.push({ arr, s: m });
    if (this.snaps.length > 30) this.snaps.shift();
    if (m.ev) {
      this.activeR().spawnEvents(m.ev);
      for (const ev of m.ev) Sfx.play(ev);
    }
    this.gw.ball.owner = m.o || null;
    if (this.localP) this.reconcile(m);
  }

  reconcile(m) {
    const lp = this.localP;
    const row = m.p && m.p.find((r) => r[0] === this.myId);
    if (!row) return;
    const ack = row[8];
    this.sent = this.sent.filter((i) => i.s > ack);
    lp.x = row[1];
    lp.y = row[2];
    lp.z = row[3];
    lp.vx = row[4];
    lp.vy = row[5];
    lp.facing = row[6];
    lp.stamina = row[9];
    lp.special = row[11];
    lp.turbo = row[12];
    const st = row[7];
    const keepSlide = lp.state === PSTATE.slide && st !== PSTATE.slide && lp.slideT > 0.12;
    if (!keepSlide) {
      if (st === PSTATE.stun && lp.state !== PSTATE.stun) lp.stunT = CFG.player.stunTime;
      if (st === PSTATE.hold && lp.state !== PSTATE.hold) lp.holdT = 0;
      lp.state = st;
    }
    lp.charge = row[10];
    for (const inp of this.sent) {
      stepPlayer(this.gw, lp, inp.b, CFG.tick, true);
      this.collideVsSnap(m);
    }
  }

  collideVsSnap(m) {
    if (!m.p) return;
    for (const row of m.p) {
      if (row[0] === this.myId) continue;
      const fake = { x: row[1], y: row[2], z: row[3], vx: row[4], vy: row[5], r: P.r };
      collidePair(this.localP, fake);
    }
  }

  stepLocal(dt) {
    const w = this.world;
    const inputs = {};
    const mine = this.input.get();
    inputs.me = mine;
    for (const p of w.players) {
      if (p.id === "me") continue;
      const mem = this.bots.get(p.id);
      if (mem) inputs[p.id] = botBits(w, p, mem);
    }
    if (this.mode === "host") {
      for (const [id, q] of this.queues) {
        if (q.length) {
          const i = q.shift();
          inputs[id] = i.b;
          this.lastSeq.set(id, i.s);
          this.lastBits.set(id, i.b);
        } else {
          inputs[id] = this.lastBits.get(id) || 0;
        }
      }
    }
    let guard = 0;
    this.acc += dt;
    while (this.acc >= CFG.tick && guard++ < 8) {
      this.acc -= CFG.tick;
      w.step(inputs);
      this.hostTick += 1;
      if (w.events.length) {
        const evs = w.events.splice(0, w.events.length);
        this.activeR().spawnEvents(evs);
        for (const ev of evs) Sfx.play(ev);
        if (this.mode === "host") this.evAcc.push(...evs);
      }
      if (this.mode === "host" && this.hostTick % CFG.snapEvery === 0) this.sendSnap();
    }
    if (this.acc > 0.5) this.acc = 0;
  }

  stepClient(dt) {
    let guard = 0;
    this.acc += dt;
    const frozen =
      this.lastSnap && (this.lastSnap.ph === "countdown" || this.lastSnap.ph === "celebrate");
    while (this.acc >= CFG.tick && guard++ < 8) {
      this.acc -= CFG.tick;
      const raw = this.input.get();
      const bits = frozen ? 0 : raw;
      this.seq += 1;
      this.sent.push({ s: this.seq, b: bits });
      if (this.sent.length > 120) this.sent.shift();
      this.net.send({ k: "i", s: this.seq, b: bits });
      if (this.localP) {
        stepPlayer(this.gw, this.localP, bits, CFG.tick, true);
        if (this.lastSnap) this.collideVsSnap(this.lastSnap);
      }
    }
    if (this.acc > 0.5) this.acc = 0;
  }

  sendSnap() {
    const w = this.world;
    const rows = w.players.map((p) => [
      p.id,
      r1(p.x),
      r1(p.y),
      r1(p.z),
      r1(p.vx),
      r1(p.vy),
      r2(p.facing),
      p.state,
      this.lastSeq.get(p.id) || 0,
      r1(p.stamina),
      r2(p.charge),
      r1(p.special),
      r2(p.turbo),
    ]);
    const b = w.ball;
    this.net.broadcast({
      k: "s",
      tk: this.hostTick,
      ph: w.phase,
      cd: r2(w.cdT),
      tm: r2(w.timer),
      sc: [w.score.a, w.score.b],
      b: [r1(b.x), r1(b.y), r1(b.z), r1(b.vx), r1(b.vy)],
      o: b.owner,
      p: rows,
      ev: this.evAcc,
    });
    this.evAcc = [];
  }

  interpView() {
    const now = performance.now();
    const t = now - 120;
    const buf = this.snaps;
    if (!buf.length) {
      return {
        phase: "wait",
        timer: CFG.match.time,
        cdT: CFG.match.cd,
        score: { a: 0, b: 0 },
        players: [],
        ball: null,
        localId: this.myId,
      };
    }
    let s0 = buf[buf.length - 1];
    let s1 = s0;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].arr <= t) {
        s0 = buf[i];
        s1 = buf[i + 1] || s0;
        break;
      }
    }
    const last = buf[buf.length - 1];
    const beyond = Math.max(0, Math.min((t - last.arr) / 1000, 0.18));
    const f = s1.arr > s0.arr ? clamp((t - s0.arr) / (s1.arr - s0.arr), 0, 1) : 1;
    const a = s0.s;
    const c = s1.s;
    const amap = {};
    if (a.p) for (const ra of a.p) amap[ra[0]] = ra;
    const players = [];
    for (const r of c.p || []) {
      const ra = amap[r[0]] || r;
      const meta = this.rosterMap[r[0]];
      if (!meta) continue;
      const vx = r[4];
      const vy = r[5];
      const ent = {
        id: r[0],
        name: meta.nm,
        team: meta.tm,
        role: meta.rl,
        x: ra[1] + (r[1] - ra[1]) * f + (t > last.arr ? vx * beyond : 0),
        y: ra[2] + (r[2] - ra[2]) * f + (t > last.arr ? vy * beyond : 0),
        z: ra[3] + (r[3] - ra[3]) * f,
        facing: ra[6] + angDiff(ra[6], r[6]) * f,
        state: r[7],
        stamina: r[9],
        charge: r[10],
        special: r[11],
        turbo: r[12],
        vx,
        vy,
      };
      if (r[0] === this.myId && this.localP) {
        const lp = this.localP;
        ent.x = lp.x;
        ent.y = lp.y;
        ent.z = lp.z;
        ent.facing = lp.facing;
        ent.state = lp.state;
        ent.stamina = lp.stamina;
        ent.charge = lp.charge;
        ent.special = lp.special;
        ent.turbo = lp.turbo;
        ent.name = lp.name;
        ent.team = lp.team;
        ent.role = lp.role;
      }
      players.push(ent);
    }
    const ba = a.b || c.b;
    const bb = c.b;
    const bex = t > last.arr ? beyond : 0;
    const ball = {
      x: ba[0] + (bb[0] - ba[0]) * f + bb[3] * bex,
      y: ba[1] + (bb[1] - ba[1]) * f + bb[4] * bex,
      z: ba[2] + (bb[2] - ba[2]) * f,
      vx: bb[3],
      vy: bb[4],
      owner: c.o,
    };
    return {
      phase: c.ph,
      timer: c.tm,
      cdT: c.cd,
      score: { a: c.sc[0], b: c.sc[1] },
      players,
      ball,
      localId: this.myId,
    };
  }

  worldView() {
    const w = this.world;
    return {
      phase: w.phase,
      timer: w.timer,
      cdT: w.cdT,
      score: { a: w.score.a, b: w.score.b },
      players: w.players,
      ball: w.ball,
      localId: this.mode === "local" ? (w.find("me") ? "me" : null) : "me",
    };
  }

  startMatch() {
    if ((this.mode === "local" || this.mode === "host") && this.world) {
      this.world.startMatch();
      if (this.mode === "host") this.sendSnap();
    }
  }

  toLobby() {
    if ((this.mode === "local" || this.mode === "host") && this.world) {
      this.world.phase = "lobby";
      this.world.score = { a: 0, b: 0 };
      this.world.timer = CFG.match.time;
      this.world.resetBall();
      if (this.mode === "host") this.sendSnap();
    }
  }

  setTeamName(team, name) {
    if (team !== "a" && team !== "b") return;
    if (this.mode === "client" || !this.world) return;
    const fallback = team === "a" ? TEAM.a.name : TEAM.b.name;
    const nm =
      String(name || "")
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 12) || fallback;
    this.teamNames[team] = nm;
    if (this.mode === "host") this.broadcastRoster();
    else this.emitRoster();
  }

  setPlayerName(name) {
    const raw = String(name || "")
      .replace(/[<>]/g, "")
      .trim()
      .slice(0, 14);
    if (this.mode === "client") {
      if (raw) this.net.send({ k: "m", nm: raw });
      return;
    }
    if (!this.world) return;
    const me = this.world.find("me");
    if (!me || !raw) return;
    me.name = raw;
    this.name = raw;
    if (this.mode === "host") this.broadcastRoster();
    else this.emitRoster();
  }

  respawn(p) {
    const idx =
      p.role === "gk"
        ? -1
        : this.world.players.filter(
            (q) => q.team === p.team && q.role !== "gk" && q !== p
          ).length;
    const s = spawnFor(p.team, idx);
    p.x = s.x;
    p.y = s.y;
    p.z = 0;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.facing = p.team === "a" ? 0 : Math.PI;
    p.state = PSTATE.normal;
    p.stunT = CFG.player.stunTime;
    p.slideT = 0;
    p.charge = 0;
    p.punchT = 0;
    p.punchCd = 0;
    p.flyT = 0;
    p.flyCd = 0;
  }

  applyTeam(id, team) {
    if (!this.world || (team !== "a" && team !== "b")) return;
    const p = this.world.find(id);
    if (!p || p.team === team) return;
    if (p.role === "gk") {
      const gk = this.world.players.find(
        (q) => q.team === team && q.role === "gk" && q.id !== id
      );
      if (gk) this.world.setRole(id, "line");
    }
    this.world.setTeam(id, team);
    this.respawn(p);
  }

  requestTeam(team) {
    if (team !== "a" && team !== "b") return;
    if (this.mode === "client") {
      this.net.send({ k: "m", tm: team });
      return;
    }
    if (!this.world || !this.world.find("me")) return;
    const me = this.world.find("me");
    if (me.team === team) return;
    if (this.world.teamCount(team) >= CFG.perTeam) {
      this.h.onToast && this.h.onToast("time cheio");
      return;
    }
    this.applyTeam("me", team);
    if (this.mode === "host") this.broadcastRoster();
    else this.emitRoster();
  }

  requestRole(role) {
    if (this.mode === "client") {
      this.net.send({ k: "m", rl: role });
      return;
    }
    if (!this.world || !this.world.find("me")) return;
    const me = this.world.find("me");
    if (role === "gk" && me.team) {
      const other = this.world.players.find((p) => p.team === me.team && p.role === "gk" && p.id !== "me");
      if (other) {
        this.h.onToast && this.h.onToast("ja tem goleiro");
        return;
      }
    }
    this.world.setRole("me", role);
    if (this.mode === "host") this.broadcastRoster();
    else this.emitRoster();
  }

  activeR() {
    return this.use3d && this.r3d ? this.r3d : this.r;
  }

  resize() {
    this.activeR().resize();
  }

  async setView(mode) {
    if (mode === "3d") {
      if (!this.canvas3d) {
        this.h.onToast && this.h.onToast("3D indisponível neste navegador");
        return;
      }
      if (!this.r3d) {
        try {
          const mod = await import("./render3d.js");
          this.r3d = new mod.Renderer3D(this.canvas3d);
        } catch (e) {
          this.h.onToast && this.h.onToast("não deu pra carregar o 3D");
          return;
        }
      }
      this.use3d = true;
      this.canvas3d.classList.remove("hidden");
      this.canvas.classList.add("hidden");
      this.r3d.resize();
    } else {
      this.use3d = false;
      this.canvas.classList.remove("hidden");
      if (this.canvas3d) this.canvas3d.classList.add("hidden");
      this.r.resize();
    }
    this.h.onView && this.h.onView(this.use3d ? "3d" : "2d");
  }

  toggleView() {
    return this.setView(this.use3d ? "2d" : "3d");
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.mode) {
      this.activeR().draw(
        { phase: "lobby", timer: 0, cdT: 0, score: { a: 0, b: 0 }, players: [], ball: null, localId: null },
        dt,
        now
      );
      return;
    }
    if (this.mode === "local" || this.mode === "host") this.stepLocal(dt);
    else this.stepClient(dt);
    const view = this.mode === "client" ? this.interpView() : this.worldView();
    this.activeR().draw(view, dt, now);
    this.hudHooks(view);
  }

  hudHooks(view) {
    if (this.prevPhase !== view.phase) {
      if (view.phase === "over") Sfx.play({ k: "whistle" });
      this.prevPhase = view.phase;
    }
    if (this.prevScore.a !== -1) {
      if (view.score.a > this.prevScore.a) this.h.onGoal && this.h.onGoal("a");
      else if (view.score.b > this.prevScore.b) this.h.onGoal && this.h.onGoal("b");
    }
    this.prevScore = { a: view.score.a, b: view.score.b };
    this.h.onState && this.h.onState(view);
  }
}
