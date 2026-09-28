import http from 'http';

/**
 * Minimal Docker Engine API client. Talks to the real Docker socket by default
 * (mounted read-write into the DBHub server container as /var/run/docker.sock),
 * or to a DOCKER_HOST (tcp://host:port) when set — the same convention the
 * official Docker CLI/SDKs use. No shell commands, no docker CLI binary needed.
 */
const DOCKER_HOST = process.env.DOCKER_HOST || `unix://${process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'}`;

function target() {
  if (DOCKER_HOST.startsWith('tcp://')) {
    const u = new URL(DOCKER_HOST.replace('tcp://', 'http://'));
    return { host: u.hostname, port: Number(u.port) || 2375 };
  }
  return { socketPath: DOCKER_HOST.replace('unix://', '') };
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request({
      ...target(),
      path,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : undefined,
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (res.statusCode >= 400) {
          const msg = (data && data.message) || `Docker API HTTP ${res.statusCode}`;
          return reject(Object.assign(new Error(msg), { status: res.statusCode }));
        }
        resolve(data);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Docker API request timed out')));
    req.on('error', (err) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        reject(new Error('Cannot reach Docker. Mount /var/run/docker.sock into the DBHub server container to enable Docker monitoring.'));
      } else {
        reject(err);
      }
    });
    if (payload) req.write(payload);
    req.end();
  });
}

let availability = null; // cache the yes/no + reason for a short time
export async function dockerAvailable() {
  if (availability && Date.now() - availability.at < 15000) return availability.value;
  try {
    await request('GET', '/version');
    availability = { at: Date.now(), value: { ok: true } };
  } catch (err) {
    availability = { at: Date.now(), value: { ok: false, reason: err.message } };
  }
  return availability.value;
}

export const listImages = () => request('GET', '/images/json');
export const listContainers = (all = true, withSize = false) => request('GET', `/containers/json?all=${all ? '1' : '0'}${withSize ? '&size=1' : ''}`);
export const inspectContainer = (id) => request('GET', `/containers/${encodeURIComponent(id)}/json`);
export const listVolumes = () => request('GET', '/volumes');
export const systemDf = () => request('GET', '/system/df');

/** Remove images not referenced by any container. `danglingOnly` restricts to untagged layers. */
export const pruneImages = (danglingOnly) =>
  request('POST', `/images/prune?filters=${encodeURIComponent(JSON.stringify({ dangling: [danglingOnly ? 'true' : 'false'] }))}`);

/** Remove stopped/exited containers (Docker never touches running ones). */
export const pruneContainers = () => request('POST', '/containers/prune');

/** Remove unused build cache layers. */
export const pruneBuildCache = () => request('POST', '/build/prune');

/** Remove ONE named volume. Docker itself refuses (409) if any container still uses it. */
export const removeVolume = (name) => request('DELETE', `/volumes/${encodeURIComponent(name)}`);
