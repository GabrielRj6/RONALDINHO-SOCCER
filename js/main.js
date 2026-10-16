import { Input } from "./input.js";
import { Sfx } from "./audio.js";
import { Game } from "./game.js";
import { UI } from "./ui.js";

const canvas = document.getElementById("c");
const input = new Input();
input.attach();
const ui = new UI();

const game = new Game(canvas, input, {
  onRoster: (l) => ui.setRoster(l),
  onState: (v) => ui.setState(v),
  onGoal: (t) => ui.showGoal(t),
  onToast: (m) => ui.toast(m),
  onRoomReady: (c) => ui.roomReady(c),
  onRoomFail: (r) => ui.roomFail(r),
  onLeft: (m) => ui.left(m),
});

ui.bind(game, input);
input.onKey = (code) => ui.onKey(code);

window.addEventListener("resize", () => game.r.resize());
window.addEventListener("pointerdown", () => Sfx.unlock(), { passive: true });
window.addEventListener("keydown", () => Sfx.unlock(), { passive: true });

game.startAttract();
