import { createClient } from '@supabase/supabase-js';

export type StorageMode = 'local' | 'supabase';

export const STORAGE_MODE: StorageMode =
  (import.meta.env.VITE_API_MODE as StorageMode) || 'local';

export const LOCAL_API_URL: string =
  import.meta.env.VITE_LOCAL_API_URL || '/api';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = STORAGE_MODE === 'supabase' && supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const EDGE_FUNCTION_URL = supabaseUrl
  ? `${supabaseUrl}/functions/v1/db-proxy`
  : '';

export async function callEdgeFunction(route: string, body: Record<string, unknown>) {
  if (STORAGE_MODE === 'local') {
    return callLocalApi(route, body);
  }
  const response = await fetch(`${EDGE_FUNCTION_URL}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
    throw new Error(err.error || `Request failed (${response.status})`);
  }
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function callLocalApi(route: string, body: Record<string, unknown>) {
  const routeMap: Record<string, string> = {
    '/test': '/test-connection',
    '/query': '/query',
    '/tables': '/tables',
    '/columns': '/columns',
  };
  const apiRoute = routeMap[route] || route;
  const response = await fetch(`${LOCAL_API_URL}${apiRoute}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
    throw new Error(err.error || `Request failed (${response.status})`);
  }
  const data = await response.json();
  if (data.error && !data.success) throw new Error(data.error);
  return data;
}
