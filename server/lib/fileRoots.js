import fs from 'fs';
import * as docker from './dockerClient.js';

/**
 * The file manager's "roots" are the directories a user is allowed to pick as a starting
 * point. "Server files" is the host root (mounted read-write as /hostfs). "Container folders"
 * are resolved from Docker itself — each container's writable filesystem (its overlay2 merged
 * view, i.e. exactly what the process inside the container sees) and each of its volume/bind
 * mounts — so browsing works even for containers with no shell inside them (distroless, scratch…).
 */
const HOST_ROOT = process.env.HOST_FS_ROOT && fs.existsSync(process.env.HOST_FS_ROOT) ? process.env.HOST_FS_ROOT : null;

export function hostRootAvailable() { return !!HOST_ROOT; }

async function containerRoots() {
  const avail = await docker.dockerAvailable();
  if (!avail.ok) return [];
  const containers = await docker.listContainers(true);
  const roots = [];
  for (const c of containers) {
    const name = (c.Names?.[0] || c.Id).replace(/^\//, '');
    let detail;
    try { detail = await docker.inspectContainer(c.Id); } catch { continue; }
    const merged = detail.GraphDriver?.Data?.MergedDir;
    if (merged && fs.existsSync(merged)) {
      roots.push({ id: `container:${c.Id}:merged`, label: `${name} — système de fichiers`, path: merged, containerId: c.Id, containerName: name, kind: 'merged', running: c.State === 'running' });
    }
    for (const m of detail.Mounts || []) {
      if (!m.Source || !fs.existsSync(m.Source)) continue;
      const label = m.Type === 'volume' ? `${name} — volume "${m.Name}"` : `${name} — ${m.Destination}`;
      roots.push({ id: `container:${c.Id}:mount:${m.Destination}`, label, path: m.Source, containerId: c.Id, containerName: name, kind: 'mount', mountDestination: m.Destination, running: c.State === 'running' });
    }
  }
  return roots;
}

export async function listRoots() {
  const roots = [];
  if (HOST_ROOT) roots.push({ id: 'host', label: 'Fichiers du serveur', path: HOST_ROOT, kind: 'host' });
  roots.push(...await containerRoots());
  return roots;
}

export async function resolveRoot(id) {
  if (id === 'host') { if (!HOST_ROOT) throw Object.assign(new Error("Les fichiers du serveur ne sont pas montés (HOST_FS_ROOT)."), { status: 400 }); return { id, path: HOST_ROOT, label: 'Fichiers du serveur' }; }
  const roots = await containerRoots();
  const found = roots.find((r) => r.id === id);
  if (!found) throw Object.assign(new Error('Cet emplacement est introuvable ou le conteneur a disparu.'), { status: 404 });
  return found;
}
