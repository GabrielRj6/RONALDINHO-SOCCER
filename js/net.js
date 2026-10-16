const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

const safeSend = (c, m) => {
  try {
    if (c && c.open) c.send(m);
  } catch (e) {
    /* ignore */
  }
};

export class HostNet {
  constructor(code, h) {
    this.h = h;
    this.conns = new Map();
    this.peer = new Peer("gam" + code, { debug: 0, config: ICE });
    this.peer.on("open", () => {
      this.ready = true;
      h.onReady && h.onReady();
    });
    this.peer.on("error", (e) => {
      if (this.ready) {
        h.onFatal && h.onFatal(e);
        return;
      }
      if (e.type === "unavailable-id") h.onIdTaken && h.onIdTaken();
      else h.onFatal && h.onFatal(e);
    });
    this.peer.on("connection", (conn) => this.wire(conn));
  }

  wire(conn) {
    let pid = null;
    conn.on("data", (m) => {
      if (!m || typeof m.k !== "string") return;
      if (m.k === "j") {
        if (pid) return;
        pid = conn.peer;
        this.conns.set(pid, conn);
        const err = this.h.onJoin ? this.h.onJoin(pid, m) : null;
        if (err) {
          this.conns.delete(pid);
          safeSend(conn, { k: "err", msg: err });
          setTimeout(() => {
            try {
              conn.close();
            } catch (e) {}
          }, 400);
        }
      } else if (m.k === "m" && pid) {
        this.h.onMeta && this.h.onMeta(pid, m);
      } else if (m.k === "i" && pid) {
        this.h.onInput && this.h.onInput(pid, m.s, m.b);
      }
    });
    const drop = () => {
      if (pid) {
        this.conns.delete(pid);
        this.h.onLeave && this.h.onLeave(pid);
        pid = null;
      }
    };
    conn.on("close", drop);
    conn.on("error", drop);
  }

  send(id, msg) {
    safeSend(this.conns.get(id), msg);
  }

  broadcast(msg) {
    for (const c of this.conns.values()) safeSend(c, msg);
  }

  get count() {
    return this.conns.size;
  }

  close() {
    this.broadcast({ k: "bye", msg: "sala encerrada" });
    try {
      this.peer.destroy();
    } catch (e) {}
  }
}

export class ClientNet {
  constructor(code, h) {
    this.h = h;
    this.ready = false;
    this.peer = new Peer({ debug: 0, config: ICE });
    this.timer = setTimeout(() => {
      if (!this.ready) h.onFail && h.onFail("timeout");
    }, 12000);
    this.peer.on("open", () => {
      const c = this.peer.connect("gam" + code, { reliable: true, serialization: "json" });
      this.conn = c;
      c.on("open", () => {
        clearTimeout(this.timer);
        this.ready = true;
        h.onOpen && h.onOpen();
      });
      c.on("data", (m) => {
        if (m && m.k) h.onMsg && h.onMsg(m);
      });
      const bye = () => {
        clearTimeout(this.timer);
        if (this.ready) h.onClose && h.onClose("conexao perdida");
        else h.onFail && h.onFail("conexao");
      };
      c.on("close", bye);
      c.on("error", bye);
    });
    this.peer.on("error", (e) => {
      clearTimeout(this.timer);
      if (this.ready) {
        h.onClose && h.onClose("conexao perdida");
        return;
      }
      if (e.type === "peer-unavailable") h.onFail && h.onFail("notfound");
      else h.onFail && h.onFail("erro");
    });
  }

  send(msg) {
    safeSend(this.conn, msg);
  }

  close() {
    clearTimeout(this.timer);
    try {
      this.peer.destroy();
    } catch (e) {}
  }
}
