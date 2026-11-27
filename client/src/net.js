// WebSocket-Verbindung mit automatischem Wiederverbinden.
const store = {
  get(k, d = null) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
export { store };

export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.queue = [];
    this.retry = 0;
    this.connect();
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = (this.ws = new WebSocket(`${proto}://${location.host}/ws`));
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus?.('online');
      this.raw({ t: 'hello', token: store.get('fw.token'), name: store.get('fw.name'), avatar: store.get('fw.avatar') });
      const q = this.queue;
      this.queue = [];
      for (const m of q) this.raw(m);
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'welcome') store.set('fw.token', msg.token);
      this.onMessage(msg);
    };
    ws.onclose = (e) => {
      this.onStatus?.('offline');
      if (e.code === 4000) return; // in anderem Tab geöffnet
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  raw(m) { this.ws.send(JSON.stringify(m)); }

  send(m) {
    if (this.ws?.readyState === 1) this.raw(m);
    else this.queue.push(m);
  }
}
