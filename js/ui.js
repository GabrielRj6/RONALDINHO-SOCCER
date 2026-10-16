import { TEAM } from "./config.js";
import { fmtTime, shortId } from "./utils.js";
import { KEY_HELP } from "./input.js";
import { Sfx } from "./audio.js";

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.game = null;
    this.input = null;
    this.phase = null;
    this.goalT = null;
    this.toastT = null;
    this.prev = {};
    this.el = {
      menu: $("menu"),
      lobby: $("lobby"),
      hud: $("hud"),
      end: $("endScreen"),
      nick: $("nick"),
      code: $("code"),
      roomCode: $("roomCode"),
      lobbyNote: $("lobbyNote"),
      roster: $("roster"),
      btnStart: $("btnStart"),
      scoreA: $("scoreA"),
      scoreB: $("scoreB"),
      timer: $("timer"),
      countdown: $("countdown"),
      goalBanner: $("goalBanner"),
      toast: $("toast"),
      keys: $("keys"),
      endTitle: $("endTitle"),
      endScore: $("endScore"),
      endNote: $("endNote"),
      btnNewMatch: $("btnNewMatch"),
      connectNote: $("connectNote"),
    };
    const saved = localStorage.getItem("gam_nick");
    if (saved) this.el.nick.value = saved;
    this.el.keys.innerHTML = KEY_HELP.map(
      ([k, d]) => `<span><kbd>${k}</kbd> ${d}</span>`
    ).join("");
  }

  bind(game, input) {
    this.game = game;
    this.input = input;
    const g = game;
    $("btnPractice").onclick = (e) => {
      e.target.blur();
      this.saveNick();
      g.startPractice(this.nick(), "a", "line");
    };
    $("btnCreate").onclick = (e) => {
      e.target.blur();
      this.saveNick();
      const code = shortId();
      this.setRoomCode(code);
      this.el.lobbyNote.textContent = "abrindo sala…";
      g.startHost(this.nick(), code, "a", "line");
    };
    $("btnJoin").onclick = (e) => {
      e.target.blur();
      this.tryJoin();
    };
    this.el.code.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.tryJoin();
      e.stopPropagation();
    });
    this.el.nick.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.saveNick();
        g.startPractice(this.nick(), "a", "line");
      }
      e.stopPropagation();
    });
    $("btnCopy").onclick = (e) => {
      e.target.blur();
      const code = this.el.roomCode.textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
      this.toast("código " + code + " copiado");
    };
    this.el.btnStart.onclick = (e) => {
      e.target.blur();
      g.startMatch();
    };
    $("btnLeave").onclick = (e) => {
      e.target.blur();
      this.leaveRoom();
    };
    $("btnEndLeave").onclick = (e) => {
      e.target.blur();
      this.leaveRoom();
    };
    this.el.btnNewMatch.onclick = (e) => {
      e.target.blur();
      g.toLobby();
    };
    this.el.roster.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      b.blur();
      if (b.dataset.act === "team") g.requestTeam(b.dataset.v);
      else g.requestRole(b.dataset.v);
    });
  }

  saveNick() {
    localStorage.setItem("gam_nick", this.el.nick.value.trim().slice(0, 14));
  }

  nick() {
    return this.el.nick.value.trim().slice(0, 14) || "Jogador";
  }

  tryJoin() {
    const code = this.el.code.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    this.el.code.value = code;
    if (code.length < 4) {
      this.toast("digite um código de 5 caracteres");
      return;
    }
    this.saveNick();
    this.el.connectNote.textContent = "conectando…";
    this.game.startClient(this.nick(), code, "a", "line");
  }

  setRoomCode(code) {
    this.el.roomCode.textContent = code;
  }

  selfId() {
    if (!this.game) return null;
    return this.game.mode === "client" ? this.game.myId : "me";
  }

  inRoom() {
    return !!this.game && !this.game.attract && !!this.game.mode;
  }

  leaveRoom() {
    this.game.teardown();
    this.game.startAttract();
    this.showScreen("menu");
    this.el.connectNote.textContent = "";
  }

  showScreen(which) {
    if (this.screen === which) return false;
    this.screen = which;
    this.el.menu.classList.toggle("hidden", which !== "menu");
    this.el.lobby.classList.toggle("hidden", which !== "lobby");
    this.el.end.classList.toggle("hidden", which !== "end");
    this.el.hud.classList.toggle("hidden", which === "menu" || which === "lobby");
    if (which === "menu") this.el.connectNote.textContent = "";
    return true;
  }

  roomReady(code) {
    this.setRoomCode(code);
    this.el.lobbyNote.textContent = "mande o link do jogo + código pra galera";
    this.toast("sala aberta! código " + code);
  }

  roomFail(why) {
    const map = {
      notfound: "sala não encontrada",
      timeout: "tempo esgotado",
      erro: "falha na conexão",
      conexao: "falha na conexão",
      "codigo ocupado": "tente outro código",
    };
    this.toast(map[why] || why || "falha na conexão");
    this.el.connectNote.textContent = "";
  }

  left(msg) {
    this.toast(msg || "você saiu da sala");
    this.showScreen("menu");
  }

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  showGoal(team) {
    if (!this.game || this.game.attract) return;
    const b = this.el.goalBanner;
    b.textContent = team === "a" ? "GOL DO AZUL!" : "GOL DO VERMELHO!";
    b.style.color = TEAM[team].color;
    b.classList.add("show");
    clearTimeout(this.goalT);
    this.goalT = setTimeout(() => b.classList.remove("show"), 2400);
  }

  onKey(code) {
    if (code === "KeyM") {
      const m = Sfx.toggleMute();
      this.toast(m ? "som desligado" : "som ligado");
    } else if (code === "KeyH") {
      this.el.keys.classList.toggle("hidden");
    } else if (code === "Escape") {
      if (this.inRoom()) this.leaveRoom();
    }
  }

  setRoster(list) {
    const me = this.selfId();
    const counts = { a: 0, b: 0 };
    for (const r of list) counts[r.tm] = (counts[r.tm] || 0) + 1;
    let html = `<div class="counts"><span class="ca">${TEAM.a.name} ${counts.a}</span><span class="cb">${TEAM.b.name} ${counts.b}</span></div>`;
    for (const r of list) {
      const isMe = r.id === me;
      const color = r.rl === "gk" ? TEAM[r.tm].gk : TEAM[r.tm].color;
      html += `<div class="rrow${isMe ? " me" : ""}">
        <span class="rname" style="border-color:${color}">${esc(r.nm)}${r.bot ? ' <i>BOT</i>' : ""}</span>`;
      if (isMe) {
        html += `<span class="picks">
          <button class="tb${r.tm === "a" ? " active" : ""}" data-act="team" data-v="a">A</button>
          <button class="tb b${r.tm === "b" ? " active" : ""}" data-act="team" data-v="b">B</button>
          <button class="tl${r.rl === "line" ? " active" : ""}" data-act="role" data-v="line">LINHA</button>
          <button class="tg${r.rl === "gk" ? " active" : ""}" data-act="role" data-v="gk">GOL</button>
        </span>`;
      } else {
        const roleName = r.rl === "gk" ? "GOL" : "LINHA";
        html += `<span class="badge" style="--c:${color}">${TEAM[r.tm].name} · ${roleName}</span>`;
      }
      html += `</div>`;
    }
    this.el.roster.innerHTML = html;
    this.updateLobbyChrome();
  }

  updateLobbyChrome() {
    if (!this.game) return;
    const isDirector = this.game.mode === "host" || this.game.mode === "local";
    this.el.btnStart.classList.toggle("hidden", !isDirector);
    if (this.game.mode === "client") {
      this.el.lobbyNote.textContent = "aguardando o anfitrião iniciar a partida";
    } else if (this.el.lobbyNote.textContent === "") {
      this.el.lobbyNote.textContent = "treino livre: anda por aí até clicar em iniciar";
    }
  }

  setState(v) {
    if (!this.game) return;
    if (this.game.attract) {
      this.showScreen("menu");
      return;
    }
    const p = v.phase;
    let screen;
    if (p === "wait") screen = "menu";
    else if (p === "lobby") screen = "lobby";
    else if (p === "over") screen = "end";
    else screen = "game";
    const changed = this.showScreen(screen);
    if (changed) {
      if (screen === "end") this.updateEnd(v);
      if (screen === "lobby") this.updateLobbyChrome();
      if (screen === "menu" && p === "wait" && !this.el.connectNote.textContent) {
        this.el.connectNote.textContent = "conectando…";
      }
      this.prev.cd = undefined;
    } else if (p === "over") {
      this.updateEnd(v);
    }
    this.phase = p;

    if (v.score.a !== this.prev.sa || v.score.b !== this.prev.sb) {
      this.el.scoreA.textContent = v.score.a;
      this.el.scoreB.textContent = v.score.b;
      this.prev.sa = v.score.a;
      this.prev.sb = v.score.b;
    }
    const time = fmtTime(v.timer);
    if (time !== this.prev.t) {
      this.el.timer.textContent = time;
      this.prev.t = time;
    }
    if (v.phase === "countdown") {
      const n = Math.max(1, Math.ceil(v.cdT - 0.001));
      if (n !== this.prev.cd) {
        this.el.countdown.textContent = n;
        this.el.countdown.classList.add("show");
        this.prev.cd = n;
      }
    } else if (v.phase === "playing" || v.phase === "celebrate") {
      if (this.prev.cd !== 0) {
        this.el.countdown.classList.remove("show");
        this.prev.cd = 0;
      }
    }
  }

  updateEnd(v) {
    const s = v.score;
    this.el.endScore.textContent = `${s.a} × ${s.b}`;
    let title;
    if (s.a === s.b) title = "EMPATE!";
    else title = (s.a > s.b ? TEAM.a.name : TEAM.b.name) + " VENCE!";
    if (this.el.endTitle.textContent !== title) this.el.endTitle.textContent = title;
    const isDirector = this.game.mode === "host" || this.game.mode === "local";
    this.el.btnNewMatch.classList.toggle("hidden", !isDirector);
    this.el.endNote.textContent = isDirector
      ? "NOVO JOGO volta pro lobby pra trocar de time"
      : "aguardando o anfitrião";
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
