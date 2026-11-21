// App start-up, sign-in, tabs and click handling.
import { state, sb, currentSession, signIn, signOut, sendPasswordReset, updatePassword, loadMe, startDemo, loadAll, startRealtime, loadBrand, onChange, isEditor, save, recentHistory, setEditing, peopleNames } from './store.js';
import { esc, isoDate, today, addMonths, fmtDate, fmtStamp, initials, debounce } from './util.js';
import * as V from './views.js';
import { ui } from './views.js';
import { projectForm, eventForm, meetingForm, actionForm, impactForm, giftForm, toast, openForm } from './forms.js';
import { projectsById } from './model.js';
import { exportExcel, exportIcs, importIcs } from './io.js';

const app = document.getElementById('app');
let logoUrl = null;
let lastChange = null;

const TABS = [
  ['timeline', 'Timeline'], ['events', 'Events'], ['calendar', 'Calendar'], ['board', 'Board by Phase'], ['deadlines', 'Deadlines'],
  ['meeting', 'Meeting'], ['actions', 'Action Items'], ['fundraising', 'Fundraising', true], ['impact', 'Impact Data'], ['archived', 'Archived']
];
const VIEWS = { timeline: V.timelineView, events: V.eventsView, calendar: V.calendarView, board: V.boardView, deadlines: V.deadlinesView, meeting: V.meetingView, actions: V.actionsView, fundraising: V.fundraisingView, impact: V.impactView, archived: V.archivedView };

// ---------------- sign-in screens ----------------
function loginScreen(message = '') {
  app.innerHTML = `<main class="login"><div class="login-card panel">
    <p class="eyebrow">UCLA Center for East-West Medicine</p>
    <h1 class="title"><span>Project</span> Planning</h1>
    <p class="muted">Team workspace. Sign in with the account Angela set up for you, or the shared viewer account.</p>
    ${message ? `<p class="notice" role="alert">${esc(message)}</p>` : ''}
    <form id="login-form" class="stack">
      <label for="em">Email</label><input id="em" type="email" autocomplete="username" required placeholder="name@mednet.ucla.edu">
      <label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>
      <button class="btn btn-primary btn-wide" type="submit">Sign in</button>
    </form>
    <button type="button" class="link-btn" id="forgot">Forgot password?</button>
    <hr><button type="button" class="link-btn" id="demo">Preview with sample data (no sign-in, changes are not saved)</button>
  </div></main>`;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    try { await signIn(document.getElementById('em').value, document.getElementById('pw').value); await boot(); }
    catch (err) { loginScreen(err.message === 'Invalid login credentials' ? 'Email or password is not right.' : err.message); }
  });
  document.getElementById('forgot').addEventListener('click', async () => {
    const email = document.getElementById('em').value;
    if (!email) { toast('Type your email first, then click "Forgot password?"', 'error'); return; }
    try { await sendPasswordReset(email); toast('Check your email for a link to set a new password.'); } catch (err) { toast(err.message, 'error'); }
  });
  document.getElementById('demo').addEventListener('click', async () => { await startDemo(); afterLoad(); });
}

function setPasswordScreen() {
  app.innerHTML = `<main class="login"><div class="login-card panel"><h1 class="title"><span>Set</span> a New Password</h1>
    <form id="pw-form" class="stack"><label for="np">New password (at least 10 characters)</label><input id="np" type="password" minlength="10" autocomplete="new-password" required>
    <button class="btn btn-primary btn-wide" type="submit">Save password</button></form></div></main>`;
  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await updatePassword(document.getElementById('np').value); toast('Password saved.'); history.replaceState(null, '', location.pathname); await boot(); } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------- boot ----------------
async function boot() {
  if (location.hash.includes('type=recovery')) return setPasswordScreen();
  const session = await currentSession();
  if (!session) return loginScreen();
  app.innerHTML = '<main class="login"><p class="muted">Loading…</p></main>';
  try {
    const me = await loadMe(session);
    if (!me) { await sb.auth.signOut(); return loginScreen(`${session.user.email} is not on the access list for this page. Ask Angela to add you.`); }
    await loadAll();
    startRealtime();
    loadBrand().then((u) => { logoUrl = u; render(); }).catch(() => {});
    recentHistory(1).then((h) => { lastChange = h[0] || null; render(); });
    afterLoad();
  } catch (err) {
    console.error(err);
    loginScreen('Could not load the planning data: ' + err.message);
  }
}

function afterLoad() {
  const h = location.hash.replace('#', '');
  if (VIEWS[h]) ui.tab = h;
  if (ui.tab === 'fundraising' && !isEditor()) ui.tab = 'timeline';
  render();
}

sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setPasswordScreen(); });

// ---------------- render ----------------
let pending = false;
function render() {
  if (!state.mode) return;
  const active = document.activeElement;
  if (active && app.contains(active) && active.matches('textarea, input[type="text"], input:not([type]), input[type="date"]') && active.closest('#view')) { pending = true; return; }
  pending = false;
  const scroll = [...app.querySelectorAll('.tl-scroll, .cal-scroll')].map((el) => el.scrollLeft);
  const tabs = TABS.filter(([, , editorsOnly]) => !editorsOnly || isEditor());
  const online = state.online.filter((o) => o.name && o.name !== state.me.name);
  const viewHtml = VIEWS[ui.tab]();
  app.innerHTML = `
  <header class="top"><div class="top-in">
    ${logoUrl ? `<img src="${logoUrl}" alt="UCLA Health Center for East-West Medicine" class="logo">` : '<span class="logo-text">UCLA Health · Center for East-West Medicine</span>'}
    <span class="badge">Team Workspace</span>${state.mode === 'demo' ? '<span class="badge badge-demo">Sample data · changes not saved</span>' : ''}
    <div class="top-right">
      ${online.length ? `<span class="online" aria-label="Also online">${online.map((o) => `<span class="avatar avatar-sm" title="${esc(o.name + (o.editing ? ' is editing ' + o.editing : ' is online'))}">${esc(initials(o.name))}</span>`).join('')}</span>` : ''}
      <span class="me"><span class="avatar" aria-hidden="true">${esc(initials(state.me.name))}</span>${esc(state.me.name)} · ${state.me.role === 'editor' ? 'Editor' : 'Viewer'}</span>
      <button type="button" class="btn btn-small" data-do="signout">${state.mode === 'demo' ? 'Exit preview' : 'Sign out'}</button>
    </div></div></header>
  <main class="page">
    <div class="title-row"><div><h1 class="title"><span>Project</span> Planning</h1>
      <p class="muted small">${lastChange ? `Last change by ${esc(lastChange.changed_by || 'someone')}, ${esc(fmtStamp(lastChange.changed_at))}` : state.mode === 'demo' ? 'Preview with the confirmed project list' : ''}</p></div>
      <div class="row-gap">${isEditor() ? '<button type="button" class="btn btn-gold" data-add="project:active">+ Add Project</button>' : ''}<button type="button" class="btn" data-do="excel">Export to Excel</button></div></div>
    <nav class="tabbar panel" aria-label="Views"><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${ui.tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
      ${['timeline', 'events'].includes(ui.tab) ? rangeControls() : ''}</nav>
    <div id="view">${viewHtml}</div>
  </main>
  <datalist id="people">${peopleNames().map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>`;
  app.querySelectorAll('.tl-scroll, .cal-scroll').forEach((el, i) => { if (scroll[i]) el.scrollLeft = scroll[i]; });
}

function rangeControls() {
  const y = today().getFullYear();
  const fy = today().getMonth() >= 6 ? y : y - 1;
  const ranges = [['cal-this', `Calendar ${y}`], ['cal-next', `Calendar ${y + 1}`], ['fiscal', `Fiscal ${fy}–${String(fy + 1).slice(2)} (Jul–Jun)`], ['fiscal-next', `Fiscal ${fy + 1}–${String(fy + 2).slice(2)}`]];
  return `<div class="row-gap"><div class="seg" role="group" aria-label="Year">${ranges.map(([v, l]) => `<button type="button" aria-pressed="${ui.range === v}" data-set="range:${v}">${l}</button>`).join('')}</div>
    ${ui.tab === 'timeline' ? `<label for="leadf" class="muted">Lead</label><select id="leadf" data-set-select="lead"><option value="">All faculty</option>${peopleNames('Faculty').map((p) => `<option${ui.lead === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>` : ''}</div>`;
}

onChange(render);
app.addEventListener('focusout', () => setTimeout(() => {
  if (!pending) return;
  const a = document.activeElement;
  if (!a || !app.contains(a) || !a.matches('textarea, input')) render();
}, 50));

// ---------------- clicks ----------------
app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab], [data-open], [data-add], [data-set], [data-do], [data-calnav], [data-calday], [data-restore], [data-meetinggo], [data-fold]');
  if (!t) return;
  if (t.dataset.fold) { V.toggleFold(t.dataset.fold); render(); return; }
  if (t.dataset.tab) { ui.tab = t.dataset.tab; history.replaceState(null, '', '#' + ui.tab); render(); window.scrollTo(0, 0); return; }
  if (t.dataset.set) { const [k, v] = t.dataset.set.split(':'); ui[k] = /^\d+$/.test(v) ? Number(v) : v; render(); return; }
  if (t.dataset.open) return openItem(t.dataset.open);
  if (t.dataset.add) return addItem(t.dataset.add);
  if (t.dataset.calnav) { const n = Number(t.dataset.calnav); ui.calMonth = n === 0 ? new Date(today().getFullYear(), today().getMonth(), 1) : addMonths(ui.calMonth, n); if (n === 0) ui.calDay = isoDate(today()); render(); return; }
  if (t.dataset.calday) { ui.calDay = t.dataset.calday; render(); return; }
  if (t.dataset.restore) { const p = state.data.projects.find((x) => x.id === t.dataset.restore); await save('projects', { ...p, category: 'active' }); toast('Moved back to Active Projects'); return; }
  if (t.dataset.meetinggo) { ui.meetingKey = t.dataset.meetinggo; ui.tab = 'meeting'; history.replaceState(null, '', '#meeting'); render(); return; }
  if (t.dataset.do) return doAction(t.dataset.do);
});

app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.setSelect) { ui[t.dataset.setSelect] = t.value; render(); return; }
  if (t.dataset.calshow) { ui.calShow[t.dataset.calshow] = t.checked; render(); return; }
  if (t.dataset.toggleAction) {
    const a = state.data.actions.find((x) => x.id === t.dataset.toggleAction);
    try { await save('actions', { ...a, status: t.checked ? 'done' : 'open', done_at: t.checked ? new Date().toISOString() : null }); toast(t.checked ? 'Marked done' : 'Reopened'); }
    catch (err) { toast(err.message, 'error'); t.checked = !t.checked; }
    return;
  }
  if (t.dataset.noteField === 'quick_status') saveNote(t.closest('.topic'));
});

app.addEventListener('input', (e) => {
  if (e.target.dataset.noteField && e.target.dataset.noteField !== 'quick_status') {
    const topic = e.target.closest('.topic');
    (noteSavers.get(topic.dataset.topic) || makeSaver(topic))();
  }
});
app.addEventListener('focusin', (e) => {
  const topic = e.target.closest?.('.topic');
  if (topic && e.target.dataset.noteField) setEditing(`notes: ${topic.querySelector('h3').textContent}`);
});

app.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-add-action]');
  if (!f) return;
  e.preventDefault();
  const sel = V.resolveMeeting(ui.meetingKey);
  const tid = f.dataset.addAction;
  const isProject = !!state.data.projects.find((p) => p.id === tid);
  const fd = new FormData(f);
  try {
    await save('actions', { what: fd.get('what').trim(), owner: fd.get('owner').trim(), due_date: fd.get('due'), status: 'open', project_id: isProject ? tid : null, topic: isProject ? null : tid, meeting_id: sel?.instance?.id || null });
    toast('Action item added');
  } catch (err) { toast(err.message, 'error'); }
});

// ---------------- meeting notes autosave ----------------
const noteSavers = new Map();
function makeSaver(topic) {
  const key = topic.dataset.topic;
  const fn = debounce(() => saveNote(document.querySelector(`.topic[data-topic="${CSS.escape(key)}"]`)), 900);
  noteSavers.set(key, fn);
  return fn;
}
async function saveNote(topic) {
  if (!topic) return;
  const sel = V.resolveMeeting(ui.meetingKey);
  if (!sel?.instance) return;
  const isProject = topic.dataset.topicKind === 'project';
  const key = topic.dataset.topic;
  const existing = state.data.meeting_notes.find((n) => n.meeting_id === sel.instance.id && (isProject ? n.project_id === key : n.topic === key));
  const row = {
    ...(existing || {}), meeting_id: sel.instance.id, project_id: isProject ? key : null, topic: isProject ? null : key,
    quick_status: topic.querySelector('[data-note-field="quick_status"]:checked')?.value || null,
    update_text: topic.querySelector('[data-note-field="update_text"]')?.value.trim() || null,
    decision: topic.querySelector('[data-note-field="decision"]')?.value.trim() || null
  };
  try {
    await save('meeting_notes', row);
    let s = topic.querySelector('.saved-by');
    if (!s) { s = document.createElement('p'); s.className = 'muted small saved-by'; topic.querySelector('.note-grid')?.after(s); }
    s.textContent = 'Saved';
  } catch (err) { toast('Note not saved: ' + err.message, 'error'); }
}

// ---------------- open / add ----------------
function openItem(ref) {
  const [kind, id, date] = ref.split(':');
  if (kind === 'project') return projectForm(id);
  if (kind === 'event') return eventForm(id);
  if (kind === 'meeting') return meetingForm(id);
  if (kind === 'occ') { ui.meetingKey = ref; ui.tab = 'meeting'; history.replaceState(null, '', '#meeting'); render(); return; }
  if (kind === 'action') return actionForm(id);
  if (kind === 'impact') return impactForm(id);
  if (kind === 'gift') return giftForm(id);
}
function addItem(ref) {
  const [kind, arg] = ref.split(':');
  if (kind === 'project') return projectForm(null, { category: arg || 'active' });
  if (kind === 'event') return eventForm(null, { event_type: arg || 'Gathering' });
  if (kind === 'eventdate') return eventForm(null, { start_date: arg });
  if (kind === 'meeting') return meetingForm(null, arg ? { meeting_date: arg } : {});
  if (kind === 'action') return actionForm(null);
  if (kind === 'impact') return impactForm(null);
  if (kind === 'gift') return giftForm(null);
}

// ---------------- toolbar actions ----------------
async function doAction(what) {
  if (what === 'signout') return signOut();
  if (what === 'excel') return exportExcel().catch((err) => toast('Export failed: ' + err.message, 'error'));
  if (what === 'ics-export') return exportIcs();
  if (what === 'ics-import') return importIcs();
  if (what === 'print') return window.print();
  if (what === 'start-meeting') {
    const sel = V.resolveMeeting(ui.meetingKey);
    const title = `${sel.base.title.replace(/, [A-Z][a-z]{2}\.? \d+$/, '')}, ${fmtDate(sel.date)}`;
    const inst = await save('meetings', { title, kind: sel.base.kind, project_id: sel.base.project_id, meeting_date: isoDate(sel.date), start_time: sel.base.start_time, end_time: sel.base.end_time, location: sel.base.location, status: 'scheduled', repeats: null });
    ui.meetingKey = `meeting:${inst.id}`;
    toast('Meeting notes started. Everyone signed in sees updates live.');
    render();
    return;
  }
  if (what === 'close-meeting') return closeMeeting();
  if (what === 'show-summary') { const sel = V.resolveMeeting(ui.meetingKey); return showSummary(sel.instance.summary || buildSummary(sel.instance)); }
}

function buildSummary(inst) {
  const map = projectsById();
  const notes = state.data.meeting_notes.filter((n) => n.meeting_id === inst.id);
  const acts = state.data.actions.filter((a) => a.meeting_id === inst.id);
  const lines = [`${inst.title}`, ''];
  if (notes.length) {
    lines.push('UPDATES');
    for (const n of notes) {
      const name = map.get(n.project_id)?.name || n.topic;
      lines.push(`• ${name}${n.quick_status ? ` [${n.quick_status}]` : ''}${n.update_text ? `: ${n.update_text}` : ''}`);
      if (n.decision) lines.push(`   Decision: ${n.decision}`);
    }
    lines.push('');
  }
  if (acts.length) {
    lines.push('ACTION ITEMS');
    for (const a of acts) lines.push(`• ${a.what} (${a.owner || 'no owner'}, due ${a.due_date ? fmtDate(a.due_date) : 'no date'})`);
    lines.push('');
  }
  const open = state.data.actions.filter((a) => a.status === 'open' && a.meeting_id !== inst.id);
  if (open.length) { lines.push(`STILL OPEN FROM EARLIER: ${open.length} items`); for (const a of open.slice(0, 15)) lines.push(`• ${a.what} (${a.owner || 'no owner'}${a.due_date ? ', due ' + fmtDate(a.due_date) : ''})`); }
  return lines.join('\n');
}

async function closeMeeting() {
  const sel = V.resolveMeeting(ui.meetingKey);
  const inst = sel.instance;
  const notes = state.data.meeting_notes.filter((n) => n.meeting_id === inst.id);
  const map = projectsById();
  const issues = [];
  for (const a of state.data.actions.filter((x) => x.status === 'open' && (!x.owner || !x.due_date))) issues.push(`Action "${a.what}" has no ${!a.owner ? 'owner' : 'due date'}.`);
  for (const n of notes) if (n.update_text && n.update_text.length < 15 && !n.quick_status) issues.push(`Note for ${map.get(n.project_id)?.name || n.topic} is very short: "${n.update_text}".`);
  for (const n of notes) if (!n.update_text && !n.quick_status && !n.decision) issues.push(`Note for ${map.get(n.project_id)?.name || n.topic} is empty.`);
  const flaggedNoNote = state.data.projects.filter((p) => p.flag && p.category !== 'archived' && !notes.some((n) => n.project_id === p.id)).map((p) => p.name);
  if (flaggedNoNote.length) issues.push(`Flagged but not discussed: ${flaggedNoNote.join(', ')}.`);
  const html = `<section class="tidy"><h3>Before closing</h3>${issues.length ? `<ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul><p class="muted small">You can close now and fix these later; they also show under Needs Attention.</p>` : '<p>Everything looks complete.</p>'}</section>`;
  openForm({
    title: `Close ${inst.title}`, saveLabel: 'Close and show summary', fields: [], extraHtml: html,
    onSave: async () => {
      const summary = buildSummary(inst);
      await save('meetings', { ...inst, status: 'closed', closed_at: new Date().toISOString(), summary });
      setTimeout(() => showSummary(summary), 50);
    }
  });
}

function showSummary(text) {
  const d = openForm({ title: 'Meeting summary', fields: [], saveLabel: 'Copy to clipboard', extraHtml: `<pre class="summary">${esc(text)}</pre>`,
    onSave: async () => { await navigator.clipboard.writeText(text); } });
  if (!isEditor()) d.querySelector('.dialog-actions').insertAdjacentHTML('beforeend', '<button type="button" class="btn btn-primary copy">Copy</button>');
  d.querySelector('.copy')?.addEventListener('click', () => navigator.clipboard.writeText(text).then(() => toast('Copied')));
}

boot();
