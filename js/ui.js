import { CFG, TEAM } from "./config.js";
import { fmtTime, shortId, clamp } from "./utils.js";
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
    this.names = { a: TEAM.a.name, b: TEAM.b.name };
    this.view3d = false;
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
      btnTeams: $("btnTeams"),
      teamPanel: $("teamPanel"),
      teamAName: $("teamAName"),
      teamBName: $("teamBName"),
      btnView: $("btnView"),
      pwr: $("pwr"),
      stamBar: $("stamBar"),
      chargeBar: $("chargeBar"),
      spc: $("spc"),
      spcFill: $("spcFill"),
      spcHint: $("spcHint"),
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
    this.el.btnTeams.onclick = (e) => {
      e.target.blur();
      this.toggleTeams();
    };
    this.el.btnView.onclick = (e) => {
      e.target.blur();
      g.toggleView();
    };
    this.el.teamPanel.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      b.blur();
      if (b.dataset.act === "go") g.requestTeam(b.dataset.v);
      else if (b.dataset.act === "role") g.requestRole(b.dataset.v);
    });
    this.el.teamPanel.addEventListener("change", (e) => {
      const pn = e.target.closest("input[data-pname]");
      if (pn) {
        g.setPlayerName(pn.value);
        return;
      }
      const inp = e.target.closest("input[data-name]");
      if (inp) g.setTeamName(inp.dataset.name, inp.value);
    });
    this.el.teamPanel.addEventListener("keydown", (e) => e.stopPropagation());
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
    const inRoom = this.inRoom();
    this.el.btnTeams.classList.toggle("hidden", !inRoom);
    this.el.btnView.classList.toggle("hidden", !inRoom);
    if (!inRoom) {
      this.el.teamPanel.classList.add("hidden");
      this.el.pwr.classList.add("hidden");
    }
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
    } else if (code === "KeyT") {
      this.toggleTeams();
    } else if (code === "KeyV") {
      if (this.inRoom()) this.game.toggleView();
    } else if (code === "Escape") {
      if (this.inRoom()) this.leaveRoom();
    }
  }

  setRoster(list, names) {
    this.rosterList = list || [];
    if (names) this.names = { a: names.a || TEAM.a.name, b: names.b || TEAM.b.name };
    this.el.teamAName.textContent = this.names.a;
    this.el.teamBName.textContent = this.names.b;
    const me = this.selfId();
    const counts = { a: 0, b: 0 };
    for (const r of this.rosterList) counts[r.tm] = (counts[r.tm] || 0) + 1;
    let html = `<div class="counts"><span class="ca">${esc(this.names.a)} ${counts.a}</span><span class="cb">${esc(this.names.b)} ${counts.b}</span></div>`;
    for (const r of this.rosterList) {
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
        html += `<span class="badge" style="--c:${color}">${esc(this.names[r.tm])} · ${roleName}</span>`;
      }
      html += `</div>`;
    }
    this.el.roster.innerHTML = html;
    this.updateLobbyChrome();
    if (!this.el.teamPanel.classList.contains("hidden")) this.renderTeamPanel();
  }

  toggleTeams() {
    if (!this.inRoom()) return;
    const hidden = this.el.teamPanel.classList.toggle("hidden");
    if (!hidden) this.renderTeamPanel();
  }

  setView(mode) {
    this.view3d = mode === "3d";
    this.el.btnView.innerHTML = (this.view3d ? "2D" : "3D") + ' <kbd>V</kbd>';
    if (!this.view3d) this.el.pwr.classList.add("hidden");
  }

  renderTeamPanel() {
    if (!this.game || this.game.attract) return;
    const me = this.selfId();
    const list = this.game.rosterList ? this.game.rosterList() : this.rosterList || [];
    const isHost = this.game.mode === "host" || this.game.mode === "local";
    const mine = list.find((r) => r.id === me);
    const cols = ["a", "b"]
      .map((t) => {
        const players = list.filter((r) => r.tm === t);
        const full = players.length >= CFG.perTeam;
        const here = !!mine && mine.tm === t;
        const rows = players
          .map(
            (r) =>
              `<div class="tp-row"><span class="tp-dot2" style="--c:${r.rl === "gk" ? TEAM[t].gk : TEAM[t].color}"></span>${esc(r.nm)}${r.bot ? ' <i>BOT</i>' : ""}<span class="tp-role">${r.rl === "gk" ? "GOL" : "LINHA"}</span></div>`
          )
          .join("");
        const nameCell = isHost
          ? `<input class="tp-name" data-name="${t}" maxlength="12" value="${esc(this.names[t])}" spellcheck="false">`
          : `<div class="tp-name-ro">${esc(this.names[t])}</div>`;
        const goBtn = here
          ? `<button class="btn tiny tp-here" disabled>VOCÊ ESTÁ AQUI</button>`
          : `<button class="btn tiny tp-go ${t}" data-act="go" data-v="${t}"${full ? " disabled" : ""}>${full ? "TIME CHEIO" : "IR PRA CÁ"}</button>`;
        return `<div class="tp-col tp-${t}">
          <div class="tp-head">
            <span class="tp-bar" style="background:${TEAM[t].color}"></span>
            ${nameCell}
            <span class="tp-count">${players.length}/${CFG.perTeam}</span>
          </div>
          <div class="tp-list">${rows || '<div class="tp-empty">vazio</div>'}</div>
          ${goBtn}
        </div>`;
      })
      .join("");
    const roleBtns = mine
      ? `<div class="tp-role-pick"><span>SUA POSIÇÃO</span>
          <button class="tl${mine.rl === "line" ? " active" : ""}" data-act="role" data-v="line">LINHA</button>
          <button class="tg${mine.rl === "gk" ? " active" : ""}" data-act="role" data-v="gk">GOLEIRO</button>
        </div>`
      : "";
    const hint = isHost ? "" : '<div class="tp-hint">só o anfitrião renomeia os times</div>';
    const nameRow = mine
      ? `<div class="tp-myname"><span>NOME NA BLUSA</span><input class="tp-name" data-pname maxlength="14" value="${esc(mine.nm)}" spellcheck="false"></div>`
      : "";
    this.el.teamPanel.innerHTML = `<div class="tp-title">TIMES</div>${nameRow}<div class="tp-cols">${cols}</div>${roleBtns}${hint}`;
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

    if (this.view3d) {
      const me = v.players.find((p) => p.id === v.localId);
      if (me) {
        this.el.pwr.classList.remove("hidden");
        this.el.stamBar.style.width =
          (clamp(me.stamina / CFG.player.staminaMax, 0, 1) * 100).toFixed(1) + "%";
        this.el.chargeBar.style.width =
          (clamp(me.charge || 0, 0, 1) * 100).toFixed(1) + "%";
      } else {
        this.el.pwr.classList.add("hidden");
      }
    }

    const mine = v.players.find((p) => p.id === v.localId);
    if (mine) {
      const s = clamp((mine.special || 0) / CFG.player.specialMax, 0, 1);
      this.el.spcFill.style.width = (s * 100).toFixed(1) + "%";
      const turbo = (mine.turbo || 0) > 0;
      this.el.spc.classList.toggle("ready", s >= 1 && !turbo);
      this.el.spc.classList.toggle("turbo", turbo);
      this.el.spcHint.textContent = turbo ? "TURBO!" : s >= 1 ? "PRONTO (R)" : "";
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
