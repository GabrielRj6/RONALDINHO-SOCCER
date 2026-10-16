import { Input } from "./input.js";
import { Sfx } from "./audio.js";
import { Game } from "./game.js";
import { UI } from "./ui.js";

const canvas = document.getElementById("c");
const canvas3d = document.getElementById("c3");
const webgl = (() => {
  try {
    const t = document.createElement("canvas");
    return !!(t.getContext("webgl2") || t.getContext("webgl"));
  } catch (e) {
    return false;
  }
})();
const input = new Input();
input.attach();
const ui = new UI();

const game = new Game(
  canvas,
  input,
  {
    onRoster: (l, names) => ui.setRoster(l, names),
    onState: (v) => ui.setState(v),
    onGoal: (t) => ui.showGoal(t),
    onToast: (m) => ui.toast(m),
    onRoomReady: (c) => ui.roomReady(c),
    onRoomFail: (r) => ui.roomFail(r),
    onLeft: (m) => ui.left(m),
    onView: (m) => ui.setView(m),
  },
  webgl ? canvas3d : null
);

ui.bind(game, input);
input.onKey = (code) => ui.onKey(code);

window.addEventListener("resize", () => game.resize());
window.addEventListener("pointerdown", () => Sfx.unlock(), { passive: true });
window.addEventListener("keydown", () => Sfx.unlock(), { passive: true });

game.startAttract();
