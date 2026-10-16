export const CFG = {
  tick: 1 / 60,
  snapEvery: 3,
  maxPlayers: 10,
  perTeam: 5,
  fill: 3,
  field: {
    w: 1200,
    h: 760,
    goalTop: 230,
    goalBottom: 530,
    goalDepth: 70,
    postR: 9,
  },
  player: {
    r: 16,
    walk: 215,
    sprint: 315,
    accel: 11,
    slideSpeed: 540,
    slideTime: 0.45,
    slideCd: 1.1,
    stunTime: 0.9,
    jumpV: 430,
    grav: 1300,
    staminaMax: 100,
    sprintDrain: 26,
    regen: 17,
    claimR: 8,
    loseR: 74,
    dribbleLead: 30,
    dribbleK: 14,
    stealSpeed: 120,
    grace: 0.5,
  },
  ball: {
    r: 11,
    grav: 1500,
    roll: 145,
    bounceWall: 0.62,
    bouncePost: 0.8,
    bounceGround: 0.5,
  },
  gk: {
    catchR: 32,
    boxX: 190,
    boxPad: 85,
    holdSafe: 0.7,
    throwSpeed: 800,
  },
  match: {
    time: 180,
    cd: 3,
    celebrate: 2.4,
  },
};

export const BITS = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  sprint: 16,
  jump: 32,
  kick: 64,
  slide: 128,
};

export const PSTATE = { normal: 0, slide: 1, stun: 2, hold: 3 };

export const TEAM = {
  a: { name: "AZUL", color: "#3b82f6", dark: "#1d4ed8", gk: "#facc15" },
  b: { name: "VERMELHO", color: "#ef4444", dark: "#b91c1c", gk: "#4ade80" },
};
