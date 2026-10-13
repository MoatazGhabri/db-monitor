import net from 'net';
import http from 'http';

/**
 * Docker's "exec" API is a normal JSON REST call to *create* the exec session, but
 * *starting* it (POST /exec/{id}/start) hijacks the HTTP connection: after the response
 * headers, the socket carries raw terminal bytes in both directions until it is closed —
 * exactly what `docker exec -it` does. Node's http.request doesn't expose that raw socket
 * for a request we're sending, so this module speaks the minimal HTTP needed by hand over
 * a plain socket, then hands the socket back once the header/body boundary is found.
 */
const DOCKER_HOST = process.env.DOCKER_HOST || `unix://${process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'}`;

function connectRaw() {
  return new Promise((resolve, reject) => {
    let socket;
    if (DOCKER_HOST.startsWith('tcp://')) {
      const u = new URL(DOCKER_HOST.replace('tcp://', 'http://'));
      socket = net.connect({ host: u.hostname, port: Number(u.port) || 2375 });
    } else {
      socket = net.connect({ path: DOCKER_HOST.replace('unix://', '') });
    }
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

/** Normal JSON call (no hijack) — used to create the exec session and to resize it. */
function jsonRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const target = DOCKER_HOST.startsWith('tcp://')
      ? (() => { const u = new URL(DOCKER_HOST.replace('tcp://', 'http://')); return { host: u.hostname, port: Number(u.port) || 2375 }; })()
      : { socketPath: DOCKER_HOST.replace('unix://', '') };
    const req = http.request({
      ...target, path, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : undefined,
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (res.statusCode >= 400) return reject(Object.assign(new Error((data && data.message) || `Docker HTTP ${res.statusCode}`), { status: res.statusCode }));
        resolve(data);
      });
    });
    req.on('error', (err) => reject(err.code === 'ENOENT' || err.code === 'ECONNREFUSED' ? new Error('Docker inaccessible.') : err));
    if (payload) req.write(payload);
    req.end();
  });
}

/** Create an exec session attached to a TTY running the given shell. */
export async function createExec(containerId, shell) {
  const data = await jsonRequest('POST', `/containers/${encodeURIComponent(containerId)}/exec`, {
    AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
    Cmd: [shell], Env: ['TERM=xterm-256color'],
  });
  return data.Id;
}

/**
 * Start the exec session and hand back a raw duplex socket carrying the terminal's
 * bytes. Resolves once Docker's HTTP response headers have been consumed.
 */
export async function startExecRaw(execId) {
  const socket = await connectRaw();
  const body = JSON.stringify({ Detach: false, Tty: true });
  const req = [
    `POST /exec/${execId}/start HTTP/1.1`,
    'Host: docker',
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: Upgrade',
    'Upgrade: tcp',
    '', '',
  ].join('\r\n');

  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let settled = false;
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const head = buf.subarray(0, idx).toString('utf8');
      const rest = buf.subarray(idx + 4);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      settled = true;
      const statusLine = head.split('\r\n')[0];
      const statusCode = Number(statusLine.split(' ')[1]);
      if (statusCode >= 400) { socket.destroy(); return reject(new Error(`Docker a refusé la session (HTTP ${statusCode}).`)); }
      resolve({ socket, leftover: rest });
    };
    const onError = (err) => { if (!settled) reject(err); };
    socket.on('data', onData);
    socket.on('error', onError);
    socket.write(req + body);
  });
}

export async function resizeExec(execId, cols, rows) {
  try { await jsonRequest('POST', `/exec/${execId}/resize?h=${Math.max(1, rows | 0)}&w=${Math.max(1, cols | 0)}`, undefined); }
  catch { /* best effort — a resize failing should never kill the session */ }
}

export { jsonRequest as dockerJson };
