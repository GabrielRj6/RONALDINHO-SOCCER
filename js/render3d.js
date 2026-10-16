import * as THREE from "three";
import { CFG, TEAM, PSTATE } from "./config.js";
import { clamp, rand } from "./utils.js";

const F = CFG.field;
const P = CFG.player;
const B = CFG.ball;
const GOAL_H = 150;

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function fieldTexture() {
  const S = 1;
  const cv = document.createElement("canvas");
  cv.width = F.w * S;
  cv.height = F.h * S;
  const ctx = cv.getContext("2d");
  ctx.scale(S, S);
  const stripeW = 100;
  for (let x = 0; x < F.w; x += stripeW) {
    ctx.fillStyle = (x / stripeW) % 2 === 0 ? "#219b57" : "#1c8d4e";
    ctx.fillRect(x, 0, stripeW, F.h);
  }
  const gl = ctx.createLinearGradient(0, 0, 0, F.h);
  gl.addColorStop(0, "rgba(255,255,255,0.08)");
  gl.addColorStop(0.5, "rgba(255,255,255,0)");
  gl.addColorStop(1, "rgba(0,0,0,0.14)");
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, F.w, F.h);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, F.w - 12, F.h - 12);
  ctx.beginPath();
  ctx.moveTo(F.w / 2, 6);
  ctx.lineTo(F.w / 2, F.h - 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(F.w / 2, F.h / 2, 90, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(F.w / 2, F.h / 2, 6, 0, Math.PI * 2);
  ctx.fill();
  const BOX_D = 189;
  const BOX_H = 461;
  const GA_D = 63;
  const GA_H = 208;
  const PEN = 126;
  const ARC_R = 91;
  const ARC_A = Math.acos(Math.min(1, (BOX_D - PEN) / ARC_R));
  const y0 = (F.h - BOX_H) / 2;
  const gy0 = (F.h - GA_H) / 2;
  ctx.strokeRect(6, y0, BOX_D, BOX_H);
  ctx.strokeRect(F.w - BOX_D - 6, y0, BOX_D, BOX_H);
  ctx.strokeRect(6, gy0, GA_D, GA_H);
  ctx.strokeRect(F.w - GA_D - 6, gy0, GA_D, GA_H);
  ctx.beginPath();
  ctx.arc(PEN, F.h / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(F.w - PEN, F.h / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(PEN, F.h / 2, ARC_R, -ARC_A, ARC_A);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(F.w - PEN, F.h / 2, ARC_R, Math.PI - ARC_A, Math.PI + ARC_A);
  ctx.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function netTexture() {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ballTexture() {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#1b1f2a";
  const spots = [
    [64, 30, 15],
    [30, 70, 14],
    [98, 70, 14],
    [64, 108, 13],
    [64, 64, 11],
  ];
  for (const [x, y, r] of spots) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = 0;
    this.H = 0;
    this.meshes = new Map();
    this.shake = 0;
    this.camPos = new THREE.Vector3(F.w / 2, 340, -300);
    this.camLook = new THREE.Vector3(F.w / 2, 0, F.h / 2);
    this.spin = 0;
    this.plane = null;
    this.planeGroup = null;
    this.playerModel = null;
    this.camYaw = null;
    this.camPitch = 0.42;
    this.mouseIdle = 99;
    this.dragging = false;
    this.lastPX = 0;
    this.lastPY = 0;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a1420");
    this.scene.fog = new THREE.Fog("#0a1420", 1900, 3400);
    this.camera = new THREE.PerspectiveCamera(52, 1, 1, 8000);
    this.nameTex = new Map();
    this.netTex = netTexture();
    this.build();
    this.initParticles();
    this.resize();
    this.bindMouse();
    this.loadModels();
  }

  bindMouse() {
    const cv = this.canvas;
    const down = (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this.dragging = true;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) {}
    };
    const move = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPX;
      const dy = e.clientY - this.lastPY;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      if (this.camYaw === null) this.camYaw = 0;
      this.camYaw -= dx * 0.005;
      this.camPitch = clamp(this.camPitch + dy * 0.004, 0.1, 1.05);
      this.mouseIdle = 0;
    };
    const up = (e) => {
      this.dragging = false;
      try {
        cv.releasePointerCapture(e.pointerId);
      } catch (err) {}
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    this._unbindMouse = () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
    };
  }

  build() {
    this.scene.add(new THREE.HemisphereLight("#cfe8ff", "#20321f", 0.85));
    const sun = new THREE.DirectionalLight("#fff6e0", 1.15);
    sun.position.set(F.w / 2 - 500, 900, F.h / 2 - 400);
    sun.target.position.set(F.w / 2, 0, F.h / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -820;
    sc.right = 820;
    sc.top = 620;
    sc.bottom = -620;
    sc.near = 100;
    sc.far = 2600;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: "#0c1b16", roughness: 1 })
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.set(F.w / 2, -2, F.h / 2);
    surround.receiveShadow = true;
    this.scene.add(surround);

    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(F.w, F.h),
      new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.95 })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(F.w / 2, 0, F.h / 2);
    field.receiveShadow = true;
    this.scene.add(field);

    this.goalA = this.buildGoal(0, -1);
    this.goalB = this.buildGoal(F.w, 1);
    this.scene.add(this.goalA, this.goalB);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(B.r, 24, 18),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.6 })
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(P.r + 4, P.r + 7, 28), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.6;
    this.scene.add(this.ring);
  }

  buildGoal(gx, dir) {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 });
    const postGeo = new THREE.CylinderGeometry(F.postR, F.postR, GOAL_H, 12);
    for (const z of [F.goalTop, F.goalBottom]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(gx, GOAL_H / 2, z);
      post.castShadow = true;
      g.add(post);
    }
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(F.postR, F.postR, F.goalBottom - F.goalTop, 12),
      postMat
    );
    bar.rotation.x = Math.PI / 2;
    bar.position.set(gx, GOAL_H, (F.goalTop + F.goalBottom) / 2);
    bar.castShadow = true;
    g.add(bar);
    const depth = F.goalDepth;
    const width = F.goalBottom - F.goalTop;
    const backX = gx + dir * depth;
    const netMat = new THREE.MeshStandardMaterial({
      map: this.netTex.clone(),
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      roughness: 1,
    });
    netMat.map.repeat.set(width / 40, GOAL_H / 40);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(width, GOAL_H), netMat);
    back.rotation.y = Math.PI / 2;
    back.position.set(backX, GOAL_H / 2, (F.goalTop + F.goalBottom) / 2);
    g.add(back);
    const topMat = netMat.clone();
    topMat.map = this.netTex.clone();
    topMat.map.repeat.set(width / 40, depth / 40);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(gx + (dir * depth) / 2, GOAL_H, (F.goalTop + F.goalBottom) / 2);
    g.add(top);
    const sideMat = netMat.clone();
    sideMat.map = this.netTex.clone();
    sideMat.map.repeat.set(depth / 40, GOAL_H / 40);
    for (const z of [F.goalTop, F.goalBottom]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_H), sideMat);
      side.position.set(gx + (dir * depth) / 2, GOAL_H / 2, z);
      g.add(side);
    }
    return g;
  }

  nameSprite(text) {
    if (this.nameTex.has(text)) return this.nameTex.get(text);
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 64;
    const ctx = cv.getContext("2d");
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(text, 128, 34);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(90, 22, 1);
    this.nameTex.set(text, sprite);
    return sprite;
  }

  makePlayer(p) {
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    const isGk = p.role === "gk";
    if (this.playerModel) {
      const inst = this.playerModel.clone(true);
      inst.traverse((c) => {
        if (c.isMesh) c.castShadow = true;
      });
      g.add(inst);
    } else {
      const skin = new THREE.MeshStandardMaterial({ color: "#ffd9b3", roughness: 0.6 });
      const kit = new THREE.MeshStandardMaterial({
        color: isGk ? TEAM[p.team].gk : TEAM[p.team].color,
        roughness: 0.55,
      });
      const dark = new THREE.MeshStandardMaterial({ color: "#1b1f2a", roughness: 0.55 });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(9, 14, 6, 14), kit);
      torso.position.y = 38;
      torso.castShadow = true;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(8, 18, 14), skin);
      head.position.y = 58;
      head.castShadow = true;
      g.add(head);
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(8.3, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        dark
      );
      hair.position.y = 58.5;
      g.add(hair);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(9, 3.5, 2.5), dark);
      visor.position.set(0, 57, 7);
      g.add(visor);
      const armGeo = new THREE.CylinderGeometry(3, 2.6, 22, 8);
      const mkArm = (side) => {
        const grp = new THREE.Group();
        grp.position.set(10.5 * side, 48, 0);
        const mesh = new THREE.Mesh(armGeo, kit);
        mesh.position.y = -11;
        mesh.castShadow = true;
        grp.add(mesh);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), skin);
        hand.position.y = -22;
        grp.add(hand);
        g.add(grp);
        return grp;
      };
      const armL = mkArm(-1);
      const armR = mkArm(1);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(4.2, 12, 10), skin);
      fist.position.set(0, -23, 2);
      fist.castShadow = true;
      armR.add(fist);
      const legGeo = new THREE.CylinderGeometry(4, 3.4, 24, 8);
      const mkLeg = (side) => {
        const grp = new THREE.Group();
        grp.position.set(5 * side, 26, 0);
        const mesh = new THREE.Mesh(legGeo, dark);
        mesh.position.y = -12;
        mesh.castShadow = true;
        grp.add(mesh);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(3.8, 10, 8), dark);
        foot.position.set(0, -24, 2);
        grp.add(foot);
        g.add(grp);
        return grp;
      };
      const legL = mkLeg(-1);
      const legR = mkLeg(1);
      g.userData.armL = armL;
      g.userData.armR = armR;
      g.userData.legL = legL;
      g.userData.legR = legR;
      g.userData.anim = 0;
    }
    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(22, 3, 8, 28),
      new THREE.MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.75 })
    );
    aura.rotation.x = Math.PI / 2;
    aura.position.y = 30;
    aura.visible = false;
    g.add(aura);
    g.userData.aura = aura;
    const label = this.nameSprite(p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name);
    label.position.y = 80;
    g.add(label);
    return g;
  }

  applyBallModel(obj) {
    obj.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const d = Math.max(size.x, size.y, size.z) || 1;
    const s = (B.r * 2) / d;
    obj.scale.setScalar(s);
    const c = new THREE.Vector3();
    box.getCenter(c);
    obj.position.set(-c.x * s, -c.y * s + B.r, -c.z * s);
    this.ball.material.visible = false;
    this.ball.add(obj);
  }

  async loadModels() {
    let GLTFLoader;
    try {
      ({ GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"));
    } catch (e) {
      return;
    }
    const load = async (url) => {
      try {
        const r = await fetch(url, { method: "HEAD" });
        if (!r.ok) return null;
      } catch (e) {
        return null;
      }
      return await new Promise((res) => {
        new GLTFLoader().load(url, (g) => res(g), undefined, () => res(null));
      });
    };
    const ball = await load("modelos/ball.glb");
    if (ball && ball.scene) this.applyBallModel(ball.scene);
    const player = await load("modelos/player.glb");
    if (player && player.scene) {
      const obj = player.scene;
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      box.getSize(size);
      obj.scale.setScalar(66 / (size.y || 1));
      const box2 = new THREE.Box3().setFromObject(obj);
      obj.position.y -= box2.min.y;
      const holder = new THREE.Group();
      holder.add(obj);
      this.playerModel = holder;
      for (const [id, m] of this.meshes) {
        this.scene.remove(m);
        this.meshes.delete(id);
      }
    }
  }

  initParticles() {
    this.MAXP = 500;
    this.parts = [];
    for (let i = 0; i < this.MAXP; i++) {
      this.parts.push({
        x: 0,
        y: -10000,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        max: 1,
        active: false,
        size: 6,
      });
    }
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.MAXP * 3);
    for (let i = 0; i < this.MAXP; i++) pos[i * 3 + 1] = -10000;
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const col = new Float32Array(this.MAXP * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.pGeo = geo;
    this.pMat = new THREE.PointsMaterial({
      size: 8,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
      map: null,
    });
    this.points = new THREE.Points(geo, this.pMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.pFree = 0;
  }

  spawnPart(x, y, z, color, spd, up, grav) {
    for (let i = 0; i < 1; i++) {
      const pr = this.parts[this.pFree];
      this.pFree = (this.pFree + 1) % this.MAXP;
      const a = rand(0, Math.PI * 2);
      pr.x = x;
      pr.y = y;
      pr.z = z;
      pr.vx = Math.cos(a) * rand(spd * 0.3, spd);
      pr.vz = Math.sin(a) * rand(spd * 0.3, spd);
      pr.vy = rand(up * 0.4, up);
      pr.life = 0;
      pr.max = rand(0.35, 0.8);
      pr.active = true;
      pr.grav = grav;
      pr.color = new THREE.Color(color);
    }
  }

  burst(x, y, z, color, n, spd, up, grav) {
    for (let i = 0; i < n; i++) this.spawnPart(x, y, z, color, spd, up, grav);
  }

  spawnEvents(events) {
    if (!events) return;
    for (const ev of events) {
      const x = ev.x || 0;
      const z = ev.y || 0;
      switch (ev.k) {
        case "goal":
          this.shake = Math.max(this.shake, 22);
          this.burst(x, 30, z, TEAM[ev.team].color, 90, 420, 520, 620);
          this.burst(x, 30, z, "#ffffff", 30, 300, 460, 620);
          break;
        case "kick":
        case "throw":
          this.burst(x, 14, z, "#ffffff", ev.sup ? 26 : 12, ev.sup ? 260 : 160, 180, 260);
          break;
        case "tackle":
        case "slidehit":
          this.shake = Math.max(this.shake, 7);
          this.burst(x, 16, z, "#ffe27a", 22, 300, 260, 300);
          break;
        case "punch":
          this.burst(x, 30, z, "#ffffff", 14, 220, 200, 300);
          break;
        case "voadora":
          this.burst(x, 20, z, "#ffd166", 18, 180, 260, 260);
          break;
        case "voadorahit":
          this.shake = Math.max(this.shake, 12);
          this.burst(x, 30, z, "#ffe27a", 30, 340, 320, 340);
          break;
        case "special":
          this.shake = Math.max(this.shake, 14);
          this.burst(x, 30, z, "#7dd3fc", 40, 360, 420, 400);
          break;
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
          this.shake = Math.max(this.shake, 34);
          this.burst(x, 20, z, "#ffb703", 70, 620, 560, 640);
          this.burst(x, 20, z, "#fb8500", 40, 420, 460, 640);
          this.burst(x, 24, z, "#fff3b0", 30, 300, 380, 500);
          break;
        case "steal":
          this.burst(x, 16, z, "#ffffff", 12, 200, 180, 240);
          break;
        case "save":
          this.burst(x, 30, z, TEAM.a.gk, 20, 260, 260, 260);
          break;
        case "jump":
          this.burst(x, 4, z, "rgba(255,255,255,0.6)", 8, 90, 60, 200);
          break;
        case "land":
          this.burst(x, 4, z, "#cfd8c4", 10, 140, 90, 260);
          break;
        default:
          break;
      }
    }
  }

  buildPlane() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: "#6b7280", roughness: 0.6, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.7, metalness: 0.3 });
    const fus = new THREE.Mesh(new THREE.BoxGeometry(70, 14, 14), body);
    fus.castShadow = true;
    g.add(fus);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 92), body);
    wing.position.set(4, 0, 0);
    wing.castShadow = true;
    g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(14, 22, 4), dark);
    tail.position.set(-30, 9, 0);
    g.add(tail);
    const htail = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 34), dark);
    htail.position.set(-30, 0, 0);
    g.add(htail);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(7, 18, 12), dark);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(43, 0, 0);
    g.add(nose);
    g.visible = false;
    this.scene.add(g);
    this.planeGroup = g;
    this.bomb = new THREE.Mesh(
      new THREE.CapsuleGeometry(4, 12, 4, 8),
      new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.5 })
    );
    this.bomb.rotation.z = Math.PI / 2;
    this.bomb.visible = false;
    this.scene.add(this.bomb);
  }

  updatePlane(dt) {
    if (!this.plane) {
      if (this.planeGroup) this.planeGroup.visible = false;
      if (this.bomb) this.bomb.visible = false;
      return;
    }
    const pl = this.plane;
    pl.t += dt;
    if (pl.t >= pl.dur) {
      this.plane = null;
      if (this.planeGroup) this.planeGroup.visible = false;
      if (this.bomb) this.bomb.visible = false;
      return;
    }
    if (!this.planeGroup) this.buildPlane();
    const g = this.planeGroup;
    g.visible = true;
    const u = pl.t / pl.dur;
    const iu = 1 - u;
    const x = iu * iu * pl.sx + 2 * iu * u * pl.px + u * u * pl.tx;
    const z = iu * iu * pl.sy + 2 * iu * u * pl.py + u * u * pl.ty;
    const dx = 2 * iu * (pl.px - pl.sx) + 2 * u * (pl.tx - pl.px);
    const dz = 2 * iu * (pl.py - pl.sy) + 2 * u * (pl.ty - pl.py);
    const y = (1 - u) * 320 + 60;
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(-dz, dx);
    g.rotation.z = Math.sin(u * Math.PI) * 0.35;
    if (u > 0.78) {
      const bf = (u - 0.78) / 0.22;
      const bx = x + (pl.tx - x) * bf;
      const bz = z + (pl.ty - z) * bf;
      const by = y * (1 - bf) + 6;
      this.bomb.visible = true;
      this.bomb.position.set(bx, by, bz);
    } else {
      this.bomb.visible = false;
    }
  }

  updateParticles(dt) {
    const pos = this.pGeo.attributes.position.array;
    const col = this.pGeo.attributes.color.array;
    for (let i = 0; i < this.MAXP; i++) {
      const pr = this.parts[i];
      if (!pr.active) {
        pos[i * 3 + 1] = -10000;
        continue;
      }
      pr.life += dt;
      if (pr.life >= pr.max) {
        pr.active = false;
        pos[i * 3 + 1] = -10000;
        continue;
      }
      pr.vy -= pr.grav * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;
      if (pr.y < 2) {
        pr.y = 2;
        pr.vy *= -0.35;
        pr.vx *= 0.7;
        pr.vz *= 0.7;
      }
      pos[i * 3] = pr.x;
      pos[i * 3 + 1] = pr.y;
      pos[i * 3 + 2] = pr.z;
      const f = 1 - pr.life / pr.max;
      col[i * 3] = pr.color.r * f;
      col[i * 3 + 1] = pr.color.g * f;
      col[i * 3 + 2] = pr.color.b * f;
    }
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.W = w;
    this.H = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  posePlayer(g, p, dt) {
    g.position.set(p.x, p.z, p.y);
    const yaw = Math.PI / 2 - p.facing;
    const spd = Math.hypot(p.vx, p.vy);
    const speedN = clamp(spd / 300, 0, 1);
    let anim = g.userData.anim || 0;
    anim += spd * dt * 0.045;
    g.userData.anim = anim;
    if (p.state === PSTATE.slide) {
      g.rotation.set(-1.5, yaw, 0);
      g.position.y = p.z + 8;
    } else if (p.state === PSTATE.fly) {
      g.rotation.set(-1.15, yaw, 0);
    } else if (p.state === PSTATE.stun) {
      g.rotation.set(0, yaw, Math.sin(p.x * 0.3 + p.y * 0.2) * 0.25);
    } else if (p.state === PSTATE.punch) {
      g.rotation.set(-0.15, yaw, 0);
    } else {
      g.rotation.set(0, yaw, 0);
    }
    const armL = g.userData.armL;
    const armR = g.userData.armR;
    const legL = g.userData.legL;
    const legR = g.userData.legR;
    if (!legL) return;
    const swing = Math.sin(anim) * 0.75 * speedN;
    if (p.state === PSTATE.slide) {
      legL.rotation.x = -0.5;
      legR.rotation.x = 0.6;
      armL.rotation.x = 0.8;
      armR.rotation.x = 0.8;
    } else if (p.state === PSTATE.fly) {
      legL.rotation.x = -0.3;
      legR.rotation.x = -0.5;
      armL.rotation.x = -0.9;
      armR.rotation.x = -0.9;
    } else if (p.state === PSTATE.punch) {
      armR.rotation.x = -1.5;
      armL.rotation.x = 0.35;
      legL.rotation.x = 0.2;
      legR.rotation.x = -0.2;
    } else if (p.z > 3) {
      legL.rotation.x = -0.5;
      legR.rotation.x = 0.35;
      armL.rotation.x = -0.7;
      armR.rotation.x = -0.7;
    } else {
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.9;
      armR.rotation.x = swing * 0.9;
    }
  }

  draw(view, dt, now) {
    const lp = view.players.find((p) => p.id === view.localId) || null;
    const seen = new Set();
    for (const p of view.players) {
      seen.add(p.id);
      let m = this.meshes.get(p.id);
      if (!m || m.userData.name !== p.name || m.userData.role !== p.role || m.userData.team !== p.team) {
        if (m) this.scene.remove(m);
        m = this.makePlayer(p);
        m.userData = { name: p.name, role: p.role, team: p.team };
        this.scene.add(m);
        this.meshes.set(p.id, m);
      }
      this.posePlayer(m, p, dt);
      if (m.userData.aura) {
        m.userData.aura.visible = (p.turbo || 0) > 0;
        if (p.turbo > 0) m.userData.aura.scale.setScalar(1 + 0.08 * Math.sin(now / 120));
      }
      if (p.id === view.localId) {
        this.ring.visible = true;
        this.ring.position.set(p.x, 0.6, p.y);
        this.ringMat.color.set(p.team === "a" ? TEAM.a.color : TEAM.b.color);
      }
    }
    for (const [id, m] of this.meshes) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.meshes.delete(id);
      }
    }
    if (!lp) this.ring.visible = false;

    if (view.ball) {
      this.ball.visible = true;
      this.ball.position.set(view.ball.x, B.r + view.ball.z, view.ball.y);
      const sp = Math.hypot(view.ball.vx, view.ball.vy);
      this.spin += (sp / 260) * dt + dt;
      this.ball.rotation.z = this.spin * 1.6;
      this.ball.rotation.x = this.spin * 0.7;
    } else {
      this.ball.visible = false;
    }

    this.updateCamera(view, lp, dt);
    this.updateParticles(dt);
    this.updatePlane(dt);
    if (this.shake > 0.2) this.shake *= Math.exp(-6 * dt);
    else this.shake = 0;
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(view, lp, dt) {
    const bx = view.ball ? view.ball.x : F.w / 2;
    const bz = view.ball ? view.ball.y : F.h / 2;
    if (lp) {
      if (this.camYaw === null) this.camYaw = lp.facing;
      this.mouseIdle += dt;
      const fx = Math.cos(this.camYaw);
      const fz = Math.sin(this.camYaw);
      const dist = 250;
      const back = Math.cos(this.camPitch) * dist;
      const height = Math.sin(this.camPitch) * dist + 30;
      this.camPos.lerp(
        tmpV.set(lp.x - fx * back, height + lp.z * 0.6, lp.y - fz * back),
        1 - Math.exp(-8 * dt)
      );
      const ahead = 70;
      this.camLook.lerp(tmpV.set(lp.x + fx * ahead, 34, lp.y + fz * ahead), 1 - Math.exp(-10 * dt));
      const mx = 40;
      this.camPos.x = clamp(this.camPos.x, -mx, F.w + mx);
      this.camPos.z = clamp(this.camPos.z, -mx, F.h + mx);
    } else {
      const dist = 430;
      const height = 330;
      this.camPos.lerp(tmpV.set(bx - dist * 0.7, height, bz - dist * 0.55), 1 - Math.exp(-4 * dt));
      this.camLook.lerp(tmpV.set(bx, 10, bz), 1 - Math.exp(-6 * dt));
    }
    if (this.camPos.y < 45) this.camPos.y = 45;
    const sx = this.shake ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake ? rand(-this.shake, this.shake) : 0;
    this.camera.position.copy(this.camPos);
    this.camera.position.x += sx;
    this.camera.position.y += sy;
    this.camera.lookAt(this.camLook);
  }

  dispose() {
    if (this._unbindMouse) this._unbindMouse();
    try {
      this.renderer.dispose();
    } catch (e) {}
    for (const m of this.meshes.values()) this.scene.remove(m);
    this.meshes.clear();
  }
}
