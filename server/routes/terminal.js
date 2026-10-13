import { WebSocketServer } from 'ws';
import { authConfigured, validateToken } from '../lib/filesAuth.js';
import { createExec, startExecRaw, resizeExec } from '../lib/dockerExec.js';
import * as docker from '../lib/dockerClient.js';

/**
 * Interactive container shell, over a WebSocket. Protected by the same admin password
 * as the file manager (there is no separate "terminal" password) — anyone who can reach
 * a container's shell can reach its files anyway, so this reuses that one gate.
 * Wire-format: both directions send small JSON text frames — {type:'input'|'output', data}
 * for keystrokes/terminal bytes, {type:'resize', cols, rows}, {type:'ready'|'exit'|'error'}.
 */
export function registerTerminalWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://internal'); } catch { socket.destroy(); return; }
    if (url.pathname !== '/api/terminal') return;
    if (!authConfigured() || !validateToken(url.searchParams.get('token'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, url));
  });

  wss.on('connection', async (ws, url) => {
    const containerId = url.searchParams.get('container') || '';
    const shell = url.searchParams.get('shell') === 'bash' ? '/bin/bash' : '/bin/sh';
    const send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch { /* socket already gone */ } };

    if (!containerId) { send({ type: 'error', message: 'Conteneur manquant' }); ws.close(); return; }

    let dockerSocket = null;
    try {
      const avail = await docker.dockerAvailable();
      if (!avail.ok) throw new Error(avail.reason);
      const execId = await createExec(containerId, shell);
      const { socket, leftover } = await startExecRaw(execId);
      dockerSocket = socket;

      dockerSocket.on('data', (chunk) => send({ type: 'output', data: chunk.toString('utf8') }));
      dockerSocket.on('close', () => { send({ type: 'exit' }); ws.close(); });
      dockerSocket.on('error', (err) => { send({ type: 'error', message: err.message }); ws.close(); });

      send({ type: 'ready' });
      if (leftover && leftover.length) send({ type: 'output', data: leftover.toString('utf8') });

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
        if (msg.type === 'input' && !dockerSocket.destroyed) dockerSocket.write(msg.data);
        else if (msg.type === 'resize') resizeExec(execId, msg.cols, msg.rows);
      });
    } catch (err) {
      send({ type: 'error', message: err.message || 'Impossible de démarrer le terminal' });
      ws.close();
      return;
    }

    ws.on('close', () => { if (dockerSocket && !dockerSocket.destroyed) dockerSocket.destroy(); });
  });
}
