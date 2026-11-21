// Data layer: Supabase when signed in, or local sample data in demo mode.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, BRAND_FILES, PEOPLE as FALLBACK_PEOPLE, FACULTY as FALLBACK_FACULTY } from './config.js';
import { uuid, debounce } from './util.js';

export const TABLES = {
  projects: 'planning_projects',
  phases: 'planning_phases',
  events: 'planning_events',
  dates: 'planning_dates',
  meetings: 'planning_meetings',
  meeting_notes: 'planning_meeting_notes',
  actions: 'planning_actions',
  impact: 'planning_impact',
  gifts: 'planning_gifts',
  people: 'planning_people'
};

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export const state = {
  mode: null, // 'live' | 'demo'
  me: null, // { email, name, role }
  data: Object.fromEntries(Object.keys(TABLES).map((k) => [k, []])),
  online: [] // presence: [{ name, editing }]
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = debounce(() => listeners.forEach((fn) => fn()), 60);

export const isEditor = () => state.me?.role === 'editor';
// team: 'Faculty' for the Lead filter; omit for everyone (owners of action items, etc.)
export const peopleNames = (team) => {
  const list = state.data.people.filter((p) => p.active !== false && (!team || p.team === team)).map((p) => p.name);
  if (!list.length) return team === 'Faculty' ? FALLBACK_FACULTY : FALLBACK_PEOPLE;
  return [...new Set(list)].sort((a, b) => a.split(' ').slice(-1)[0].localeCompare(b.split(' ').slice(-1)[0]));
};

// ---------------- Auth ----------------
export async function currentSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
}
export async function signOut() {
  if (state.mode === 'live') await sb.auth.signOut();
  location.hash = '';
  location.reload();
}
export async function sendPasswordReset(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export async function updatePassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

// Returns the member record, or null if this account isn't on the list.
export async function loadMe(session) {
  const email = session.user.email.toLowerCase();
  const { data, error } = await sb.from('planning_members').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  state.mode = 'live';
  state.me = { email, name: data.name || email, role: data.role };
  return state.me;
}

export async function startDemo() {
  const { DEMO } = await import('./demo-data.js');
  state.mode = 'demo';
  state.me = { email: 'demo', name: 'Demo editor', role: 'editor' };
  for (const k of Object.keys(TABLES)) state.data[k] = structuredClone(DEMO[k] || []);
}

// ---------------- Loading ----------------
async function fetchTable(key) {
  if (key === 'gifts' && !isEditor()) return [];
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(TABLES[key]).select('*').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

export async function loadAll() {
  if (state.mode !== 'live') return;
  const keys = Object.keys(TABLES);
  const results = await Promise.all(keys.map(fetchTable));
  keys.forEach((k, i) => { state.data[k] = results[i]; });
  emit();
}

// ---------------- Saving ----------------
function stampLocal(row) { return { ...row, updated_at: new Date().toISOString(), updated_by: state.me?.name }; }

export async function save(key, row) {
  if (!isEditor()) throw new Error('Only editors can make changes.');
  const clean = { ...row };
  if (!clean.id) clean.id = uuid();
  for (const k of ['updated_at', 'updated_by', 'created_at']) delete clean[k];
  if (state.mode === 'demo') {
    const list = state.data[key];
    const i = list.findIndex((r) => r.id === clean.id);
    const stamped = stampLocal(clean);
    if (i >= 0) list[i] = { ...list[i], ...stamped }; else list.push(stamped);
    emit();
    return stamped;
  }
  const { data, error } = await sb.from(TABLES[key]).upsert(clean).select().single();
  if (error) throw error;
  const list = state.data[key];
  const i = list.findIndex((r) => r.id === data.id);
  if (i >= 0) list[i] = data; else list.push(data);
  emit();
  return data;
}

export async function remove(key, id) {
  if (!isEditor()) throw new Error('Only editors can make changes.');
  if (state.mode === 'live') {
    const { error } = await sb.from(TABLES[key]).delete().eq('id', id);
    if (error) throw error;
  }
  state.data[key] = state.data[key].filter((r) => r.id !== id);
  emit();
}

// Replace the child rows (phases or dates) of one project with a new list.
export async function syncChildren(key, field, parentId, rows) {
  const existing = state.data[key].filter((r) => r[field] === parentId);
  const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
  for (const r of existing) if (!keep.has(r.id)) await remove(key, r.id);
  for (const r of rows) await save(key, { ...r, [field]: parentId });
}

export async function history(projectId) {
  if (state.mode !== 'live') return [];
  const { data, error } = await sb.from('planning_history').select('*')
    .or(`row_id.eq.${projectId},new_row->>project_id.eq.${projectId},old_row->>project_id.eq.${projectId}`)
    .order('changed_at', { ascending: false }).limit(60);
  if (error) throw error;
  return data;
}

export async function recentHistory(limit = 1) {
  if (state.mode !== 'live') return [];
  const { data } = await sb.from('planning_history').select('changed_by, changed_at, table_name, summary')
    .order('changed_at', { ascending: false }).limit(limit);
  return data || [];
}

// ---------------- Live updates + who is online ----------------
let presenceChannel = null;
export function startRealtime() {
  if (state.mode !== 'live') return;
  const refetch = {};
  for (const key of Object.keys(TABLES)) {
    refetch[key] = debounce(async () => { state.data[key] = await fetchTable(key); emit(); }, 300);
  }
  const ch = sb.channel('planning-changes');
  for (const [key, table] of Object.entries(TABLES)) {
    if (key === 'gifts' && !isEditor()) continue;
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => refetch[key]());
  }
  ch.subscribe();

  presenceChannel = sb.channel('planning-presence', { config: { presence: { key: state.me.email } } });
  presenceChannel.on('presence', { event: 'sync' }, () => {
    const s = presenceChannel.presenceState();
    state.online = Object.values(s).map((list) => list[list.length - 1]);
    emit();
  });
  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') await presenceChannel.track({ name: state.me.name, editing: null, role: state.me.role });
  });
}
export async function setEditing(label) {
  if (presenceChannel) await presenceChannel.track({ name: state.me.name, editing: label, role: state.me.role });
}

// ---------------- Brand files (private bucket) ----------------
export async function loadBrand() {
  if (state.mode !== 'live') return null;
  const loads = BRAND_FILES.fonts.map(async (f) => {
    const { data, error } = await sb.storage.from('planning-assets').download(f.file);
    if (error || !data) return;
    const face = new FontFace(f.family, await data.arrayBuffer(), { weight: f.weight, display: 'swap' });
    await face.load();
    document.fonts.add(face);
  });
  await Promise.allSettled(loads);
  const { data } = await sb.storage.from('planning-assets').download(BRAND_FILES.logo);
  return data ? URL.createObjectURL(data) : null;
}
