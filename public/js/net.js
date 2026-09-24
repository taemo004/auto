// WebSocket-Verbindung zum Spielserver

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.id = null;
    this.connected = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return this.ready || Promise.resolve();
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ready = new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(`${proto}//${location.host}`);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      const timeout = setTimeout(() => {
        reject(new Error('timeout'));
        ws.close();
      }, 6000);
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'welcome') {
          this.id = msg.id;
          this.connected = true;
          clearTimeout(timeout);
          resolve();
        }
        const h = this.handlers[msg.t];
        if (h) h(msg);
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        const was = this.connected;
        this.connected = false;
        this.ws = null;
        reject(new Error('closed'));
        if (was && this.handlers.disconnect) this.handlers.disconnect();
      };
      ws.onerror = () => {};
    });
    return this.ready;
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}
