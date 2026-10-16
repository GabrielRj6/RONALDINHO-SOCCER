import { BITS } from "./config.js";

const MAP = {
  KeyW: BITS.up,
  ArrowUp: BITS.up,
  KeyS: BITS.down,
  ArrowDown: BITS.down,
  KeyA: BITS.left,
  ArrowLeft: BITS.left,
  KeyD: BITS.right,
  ArrowRight: BITS.right,
  ShiftLeft: BITS.sprint,
  ShiftRight: BITS.sprint,
  Space: BITS.jump,
  KeyE: BITS.slide,
  KeyF: BITS.kick,
  KeyJ: BITS.punch,
  KeyK: BITS.fly,
  KeyR: BITS.special,
};

export class Input {
  constructor() {
    this.bits = 0;
    this.blocked = false;
    this.onKey = null;
    this._down = (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (
        e.code === "KeyM" ||
        e.code === "KeyH" ||
        e.code === "KeyT" ||
        e.code === "KeyV" ||
        e.code === "Escape" ||
        e.code === "Enter"
      ) {
        if (this.onKey) this.onKey(e.code);
      }
      if (e.repeat) return;
      const b = MAP[e.code];
      if (b && !this.blocked) this.bits |= b;
    };
    this._up = (e) => {
      const b = MAP[e.code];
      if (b) this.bits &= ~b;
    };
    this._blur = () => {
      this.bits = 0;
    };
  }

  attach() {
    window.addEventListener("keydown", this._down);
    window.addEventListener("keyup", this._up);
    window.addEventListener("blur", this._blur);
  }

  get() {
    return this.blocked ? 0 : this.bits;
  }

  setBlocked(v) {
    this.blocked = v;
    if (v) this.bits = 0;
  }
}

export const KEY_HELP = [
  ["WASD", "mover"],
  ["SHIFT", "correr"],
  ["ESPAÇO", "pular"],
  ["E", "carrinho"],
  ["F", "chutar (segure)"],
  ["J", "soco"],
  ["K", "voadora"],
  ["R", "especial (quando cheio)"],
  ["T", "times / trocar"],
  ["V", "ver 2D/3D"],
];
