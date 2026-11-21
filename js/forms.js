// Edit forms (dialogs). Viewers see the same forms read-only.
import { state, save, remove, syncChildren, isEditor, history, setEditing, peopleNames } from './store.js';
import { esc, fmtStamp, uuid } from './util.js';
import { STAGES, PILLARS, CATEGORIES, TYPES, AUDIENCES, EVENT_TYPES, GIFT_STAGES, projectTree, phasesOf, datesOf } from './model.js';

// ---------------- toast + confirm ----------------
export function toast(msg, kind = 'ok') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, kind === 'error' ? 6000 : 2600);
}

export function confirmBox(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-small';
    d.innerHTML = `<form method="dialog"><p class="confirm-text">${esc(message)}</p>
      <div class="dialog-actions"><button value="no" class="btn">Cancel</button><button value="yes" class="btn btn-danger">${esc(okLabel)}</button></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('close', () => { resolve(d.returnValue === 'yes'); d.remove(); });
    d.showModal();
  });
}

// ---------------- generic form ----------------
const opt = (o) => (typeof o === 'object' ? o : { value: o, label: o });

function fieldHtml(f, v, ro, prefix = '') {
  const id = `f-${prefix}${f.name}-${Math.random().toString(36).slice(2, 7)}`;
  const req = f.required ? ' required' : '';
  const dis = ro ? ' disabled' : '';
  const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>`;
  const help = f.help ? `<p class="help">${esc(f.help)}</p>` : '';
  const wrap = (inner) => `<div class="field${f.full ? ' full' : ''}" data-field="${esc(f.name)}" data-type="${f.type}">${inner}${help}</div>`;
  switch (f.type) {
    case 'textarea':
      return wrap(`${label}<textarea id="${id}" name="${esc(f.name)}" rows="${f.rows || 3}"${req}${dis}>${esc(v ?? '')}</textarea>`);
    case 'select':
      return wrap(`${label}<select id="${id}" name="${esc(f.name)}"${req}${dis}>${f.blank !== false ? `<option value="">${esc(f.blank || '—')}</option>` : ''}${(f.options || []).map(opt).map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(v ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`);
    case 'checks': {
      const vals = new Set(v || []);
      return `<fieldset class="field full checks" data-field="${esc(f.name)}" data-type="checks"><legend>${esc(f.label)}</legend><div class="check-grid">${(f.options || []).map(opt).map((o, i) => `<label class="check"><input type="checkbox" name="${esc(f.name)}" value="${esc(o.value)}"${vals.has(o.value) ? ' checked' : ''}${dis}> ${esc(o.label)}</label>`).join('')}</div>${help}</fieldset>`;
    }
    case 'checkbox':
      return wrap(`<label class="check"><input type="checkbox" id="${id}" name="${esc(f.name)}"${v ? ' checked' : ''}${dis}> ${esc(f.label)}</label>`);
    case 'rows': {
      const rows = (v || []).map((r) => rowHtml(f, r, ro)).join('');
      return `<fieldset class="field full rows" data-field="${esc(f.name)}" data-type="rows"><legend>${esc(f.label)}</legend>${help}<div class="row-list">${rows}</div>${ro ? '' : `<button type="button" class="btn btn-small add-row">+ ${esc(f.addLabel || 'Add')}</button>`}</fieldset>`;
    }
    default: {
      const type = { date: 'date', number: 'number', url: 'url', email: 'email' }[f.type] || 'text';
      const list = f.suggest ? ` list="${id}-list"` : '';
      const dl = f.suggest ? `<datalist id="${id}-list">${f.suggest.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>` : '';
      return wrap(`${label}<input id="${id}" type="${type}" name="${esc(f.name)}" value="${esc(v ?? '')}"${req}${dis}${list}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}>${dl}`);
    }
  }
}

function rowHtml(f, r, ro) {
  return `<div class="row-item" data-id="${esc(r.id || '')}">${f.fields.map((sf) => fieldHtml(sf, r[sf.name], ro, 'r')).join('')}${ro ? '' : '<button type="button" class="btn-icon remove-row" aria-label="Remove row"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'}</div>`;
}

function readField(el, f) {
  if (f.type === 'checks') return [...el.querySelectorAll('input:checked')].map((i) => i.value);
  if (f.type === 'checkbox') return el.querySelector('input').checked;
  const input = el.querySelector('input, select, textarea');
  const v = input.value.trim();
  if (f.type === 'number') return v === '' ? null : Number(v);
  return v === '' ? null : v;
}

function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`:scope [data-field="${f.name}"]`);
    if (!el) continue;
    if (f.type === 'rows') {
      out[f.name] = [...el.querySelectorAll(':scope > .row-list > .row-item')].map((ri) => {
        const r = { id: ri.dataset.id || uuid() };
        for (const sf of f.fields) r[sf.name] = readField(ri.querySelector(`[data-field="${sf.name}"]`), sf);
        return r;
      });
    } else out[f.name] = readField(el, f);
  }
  return out;
}

export function openForm({ title, subtitle = '', fields, values = {}, onSave, onDelete, extraHtml = '', afterOpen, wide = false, saveLabel = 'Save' }) {
  const ro = !isEditor();
  const d = document.createElement('dialog');
  d.className = `dialog${wide ? ' dialog-wide' : ''}`;
  d.setAttribute('aria-labelledby', 'dlg-title');
  d.innerHTML = `<form novalidate>
    <div class="dialog-head"><div><h2 id="dlg-title">${esc(title)}</h2>${subtitle ? `<p class="dialog-sub">${esc(subtitle)}</p>` : ''}</div>
      <button type="button" class="btn-icon close" aria-label="Close"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="dialog-body">${ro ? '<p class="readonly-note">View only. Ask an editor (Angela, Anna or Annie) to make changes.</p>' : ''}
      <div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name], ro)).join('')}</div>${extraHtml}</div>
    <div class="dialog-actions">${!ro && onDelete ? '<button type="button" class="btn btn-danger-text delete">Delete</button>' : ''}<span class="spacer"></span>
      <button type="button" class="btn close">${ro ? 'Close' : 'Cancel'}</button>${ro ? '' : `<button type="submit" class="btn btn-primary">${esc(saveLabel)}</button>`}</div>
  </form>`;
  document.body.appendChild(d);
  const form = d.querySelector('form');
  d.querySelectorAll('.close').forEach((b) => b.addEventListener('click', () => d.close()));
  d.addEventListener('close', () => { d.remove(); setEditing(null); });
  form.addEventListener('click', (e) => {
    const add = e.target.closest('.add-row');
    if (add) {
      const fs = add.closest('[data-type="rows"]');
      const f = fields.find((x) => x.name === fs.dataset.field);
      fs.querySelector('.row-list').insertAdjacentHTML('beforeend', rowHtml(f, f.newRow ? f.newRow() : {}, false));
      fs.querySelector('.row-list .row-item:last-child input, .row-list .row-item:last-child select')?.focus();
    }
    const rm = e.target.closest('.remove-row');
    if (rm) rm.closest('.row-item').remove();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const vals = readForm(form, fields);
    for (const f of fields.filter((x) => x.type === 'rows')) {
      for (const r of vals[f.name]) {
        if (r.start_date && r.end_date && r.end_date < r.start_date) { toast('An end date is before its start date.', 'error'); return; }
      }
    }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try { await onSave(vals); d.close(); toast('Saved'); } catch (err) { console.error(err); toast('Could not save: ' + (err.message || err), 'error'); btn.disabled = false; btn.textContent = saveLabel; }
  });
  d.querySelector('.delete')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Delete "${title.replace(/^Edit /, '')}"? This can't be undone.`))) return;
    try { await onDelete(); d.close(); toast('Deleted'); } catch (err) { toast('Could not delete: ' + err.message, 'error'); }
  });
  d.showModal();
  setEditing(title);
  afterOpen?.(d);
  return d;
}

// ---------------- option lists ----------------
const projectOptions = (filter = () => true) => ['active', 'pipeline', 'standing', 'archived'].flatMap((c) =>
  projectTree(c).filter(({ p }) => filter(p)).map(({ p, depth }) => ({ value: p.id, label: `${'— '.repeat(depth)}${p.name}` })));

// ---------------- project ----------------
export function projectForm(id, defaults = {}) {
  const p = id ? state.data.projects.find((x) => x.id === id) : { category: 'active', sort_order: 100, ...defaults };
  if (!p) return;
  const phases = id ? phasesOf(id) : [];
  const dates = id ? datesOf(id) : [];
  const fields = [
    { name: 'name', label: 'Project name', type: 'text', required: true, full: true },
    { name: 'category', label: 'Group', type: 'select', blank: false, options: Object.entries(CATEGORIES).map(([value, c]) => ({ value, label: c.name })) },
    { name: 'parent_id', label: 'Part of (parent project)', type: 'select', blank: 'None', options: projectOptions((x) => x.id !== id) },
    { name: 'leads', label: 'Lead (PI)', type: 'text', suggest: peopleNames(), placeholder: 'e.g. Weijun Zhang' },
    { name: 'team', label: 'Team', type: 'text' },
    { name: 'pillar', label: 'Primary pillar', type: 'select', options: Object.keys(PILLARS) },
    { name: 'flag', label: 'Flag', type: 'text', suggest: ['Behind', 'Check with Weijun', 'At risk', 'On hold'], help: 'Short label shown in yellow, e.g. "Behind".' },
    { name: 'other_pillars', label: 'Other pillars reached', type: 'checks', options: Object.keys(PILLARS) },
    { name: 'types', label: 'Type', type: 'checks', options: TYPES },
    { name: 'audiences', label: 'Audiences', type: 'checks', options: AUDIENCES },
    { name: 'phases', label: 'Timeline bars (stages)', type: 'rows', addLabel: 'Add stage', help: 'Each bar is one stage with start and end dates.',
      newRow: () => ({ stage: 'Planning' }),
      fields: [
        { name: 'stage', label: 'Stage', type: 'select', blank: false, options: [...STAGES, 'Ongoing'], required: true },
        { name: 'label', label: 'Label on bar', type: 'text' },
        { name: 'start_date', label: 'Start', type: 'date', required: true },
        { name: 'end_date', label: 'End', type: 'date', required: true }
      ] },
    { name: 'dates', label: 'Key dates and deadlines', type: 'rows', addLabel: 'Add date',
      newRow: () => ({ kind: 'key' }),
      fields: [
        { name: 'on_date', label: 'Date', type: 'date', required: true },
        { name: 'label', label: 'What', type: 'text', required: true },
        { name: 'kind', label: 'Kind', type: 'select', blank: false, options: [{ value: 'key', label: 'Key date' }, { value: 'deadline', label: 'Deadline' }] },
        { name: 'tentative', label: 'To confirm', type: 'checkbox' },
        { name: 'done', label: 'Done', type: 'checkbox' }
      ] },
    { name: 'timeline_note', label: 'Note on timeline row', type: 'text', full: true, placeholder: 'e.g. Next conference Mar. 2028' },
    { name: 'public_description', label: 'Description (could be shown publicly)', type: 'textarea', full: true },
    { name: 'team_notes', label: 'Team notes (internal)', type: 'textarea', rows: 4, full: true },
    { name: 'box_url', label: 'Box folder link', type: 'url', placeholder: 'https://uclahs.box.com/...' },
    { name: 'qualtrics_url', label: 'Qualtrics survey link', type: 'url' },
    { name: 'seeking_support', label: 'Seeking support', type: 'checkbox' },
    { name: 'is_placeholder', label: 'Placeholder or example row', type: 'checkbox' },
    { name: 'sort_order', label: 'Sort order', type: 'number', help: 'Lower numbers appear first.' }
  ];
  const links = [p.box_url && `<a href="${esc(p.box_url)}" target="_blank" rel="noopener">Open Box folder</a>`, p.qualtrics_url && `<a href="${esc(p.qualtrics_url)}" target="_blank" rel="noopener">Open Qualtrics survey</a>`].filter(Boolean).join(' · ');
  const extra = `${links ? `<p class="quick-links">${links}</p>` : ''}${id && state.mode === 'live' ? '<section class="history"><h3>Change history</h3><div class="history-list">Loading…</div></section>' : ''}`;
  openForm({
    title: id ? `Edit ${p.name}` : 'Add project',
    subtitle: id && p.updated_by ? `Last changed by ${p.updated_by}, ${fmtStamp(p.updated_at)}` : '',
    fields, wide: true, extraHtml: extra,
    values: { ...p, phases, dates },
    onSave: async (v) => {
      const { phases: ph, dates: dt, ...row } = v;
      row.parent_id = row.parent_id || null;
      row.sort_order = row.sort_order ?? 100;
      const saved = await save('projects', { ...p, ...row });
      await syncChildren('phases', 'project_id', saved.id, ph);
      await syncChildren('dates', 'project_id', saved.id, dt.map((r) => ({ ...r, event_id: null })));
    },
    onDelete: id ? () => remove('projects', id) : null,
    afterOpen: async (d) => {
      const box = d.querySelector('.history-list');
      if (!box) return;
      try {
        const rows = await history(id);
        box.innerHTML = rows.length ? `<ul>${rows.map((h) => `<li><span class="h-when">${esc(fmtStamp(h.changed_at))}</span> <strong>${esc(h.changed_by || 'Someone')}</strong> ${esc(describe(h))}</li>`).join('')}</ul>` : '<p>No changes recorded yet.</p>';
      } catch (e) { box.textContent = 'History not available.'; }
    }
  });
}

const TABLE_WORD = { planning_projects: 'project', planning_phases: 'timeline bar', planning_dates: 'date', planning_actions: 'action item', planning_impact: 'impact number' };
function describe(h) {
  const what = TABLE_WORD[h.table_name] || h.table_name.replace('planning_', '');
  const verb = { insert: 'added', update: 'changed', delete: 'removed' }[h.action];
  let detail = '';
  if (h.action === 'update' && h.old_row && h.new_row) {
    const changed = Object.keys(h.new_row).filter((k) => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(h.old_row[k]) !== JSON.stringify(h.new_row[k]));
    detail = changed.slice(0, 3).map((k) => `${k.replace(/_/g, ' ')}${typeof h.new_row[k] === 'string' && h.new_row[k].length < 40 ? ` → "${h.new_row[k]}"` : ''}`).join(', ');
  }
  return `${verb} ${what}${h.summary ? ` "${h.summary}"` : ''}${detail ? `: ${detail}` : ''}`;
}

// ---------------- event ----------------
export function eventForm(id, defaults = {}) {
  const e = id ? state.data.events.find((x) => x.id === id) : { event_type: 'Gathering', host: 'CEWM', project_ids: [], extra_tags: [], ...defaults };
  if (!e) return;
  const deadlines = id ? state.data.dates.filter((d) => d.event_id === id) : [];
  openForm({
    title: id ? `Edit ${e.name}` : 'Add event',
    subtitle: id && e.updated_by ? `Last changed by ${e.updated_by}, ${fmtStamp(e.updated_at)}` : '',
    wide: true,
    fields: [
      { name: 'name', label: 'Event name', type: 'text', required: true, full: true },
      { name: 'event_type', label: 'Type', type: 'select', blank: false, options: EVENT_TYPES },
      { name: 'host', label: 'Host', type: 'select', blank: false, options: [{ value: 'CEWM', label: 'Hosted by CEWM' }, { value: 'Outside', label: 'Outside (talk or conference hosted by others)' }] },
      { name: 'start_date', label: 'Date (or first day)', type: 'date' },
      { name: 'end_date', label: 'Last day (if more than one)', type: 'date' },
      { name: 'start_time', label: 'Time', type: 'text', placeholder: 'e.g. 5:30-7:30 pm' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'when_text', label: 'Date note', type: 'text', placeholder: 'e.g. Oct. 2027, date to confirm', help: 'Use when there is no exact date yet.' },
      { name: 'lead', label: 'Lead', type: 'text', suggest: peopleNames() },
      { name: 'tentative', label: 'Date to confirm', type: 'checkbox' },
      { name: 'planning_start', label: 'Planning starts', type: 'date', help: 'Shows a planning bar leading up to the event.' },
      { name: 'project_ids', label: 'Project tags', type: 'checks', options: projectOptions((p) => p.category !== 'archived' && !p.is_placeholder && !p.parent_id) },
      { name: 'extra_tags', label: 'Other tags', type: 'checks', options: ['Center team'] },
      { name: 'deadlines', label: 'Deadlines (abstracts, registration, travel approval)', type: 'rows', addLabel: 'Add deadline',
        newRow: () => ({ kind: 'deadline' }),
        fields: [
          { name: 'on_date', label: 'Date', type: 'date', required: true },
          { name: 'label', label: 'What', type: 'text', required: true },
          { name: 'tentative', label: 'To confirm', type: 'checkbox' },
          { name: 'done', label: 'Done', type: 'checkbox' }
        ] },
      { name: 'attendance', label: 'Attendance (after the event)', type: 'number', help: 'Feeds Impact Data.' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true }
    ],
    values: { ...e, deadlines },
    onSave: async (v) => {
      const { deadlines: dl, ...row } = v;
      if (!row.end_date) row.end_date = row.start_date;
      const saved = await save('events', { ...e, ...row });
      await syncChildren('dates', 'event_id', saved.id, dl.map((r) => ({ ...r, kind: 'deadline', project_id: null })));
    },
    onDelete: id ? () => remove('events', id) : null
  });
}

// ---------------- meeting ----------------
export function meetingForm(id, defaults = {}) {
  const m = id ? state.data.meetings.find((x) => x.id === id) : { kind: 'project', status: 'scheduled', ...defaults };
  if (!m) return;
  openForm({
    title: id ? `Edit ${m.title}` : 'Add meeting',
    fields: [
      { name: 'title', label: 'Meeting name', type: 'text', required: true, full: true },
      { name: 'kind', label: 'Kind', type: 'select', blank: false, options: [{ value: 'admin', label: 'Admin meeting' }, { value: 'project', label: 'Project meeting' }] },
      { name: 'project_id', label: 'Project', type: 'select', blank: 'None', options: projectOptions((p) => p.category !== 'archived') },
      { name: 'meeting_date', label: 'Date (first date if it repeats)', type: 'date', help: 'Leave empty if not scheduled yet; it will appear under "To schedule".' },
      { name: 'repeats', label: 'Repeats', type: 'select', blank: 'Does not repeat', options: [{ value: 'weekly', label: 'Every week' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Every month' }, { value: 'quarterly', label: 'Every 3 months' }] },
      { name: 'start_time', label: 'Start time', type: 'text', placeholder: 'e.g. 10:00 am' },
      { name: 'end_time', label: 'End time', type: 'text', placeholder: 'e.g. 11:00 am' },
      { name: 'repeat_until', label: 'Repeat until', type: 'date' },
      { name: 'location', label: 'Room or Zoom link', type: 'text' },
      { name: 'tentative', label: 'To confirm', type: 'checkbox' },
      { name: 'status', label: 'Status', type: 'select', blank: false, options: [{ value: 'scheduled', label: 'Scheduled' }, { value: 'closed', label: 'Closed (notes final)' }, { value: 'cancelled', label: 'Cancelled' }] },
      { name: 'summary', label: 'Summary', type: 'textarea', full: true }
    ],
    values: m,
    onSave: (v) => save('meetings', { ...m, ...v, project_id: v.project_id || null, repeats: v.repeats || null }),
    onDelete: id ? () => remove('meetings', id) : null
  });
}

// ---------------- action item ----------------
export function actionForm(id, defaults = {}) {
  const a = id ? state.data.actions.find((x) => x.id === id) : { status: 'open', ...defaults };
  if (!a) return;
  openForm({
    title: id ? 'Edit action item' : 'Add action item',
    subtitle: id && a.updated_by ? `Last changed by ${a.updated_by}, ${fmtStamp(a.updated_at)}` : '',
    fields: [
      { name: 'what', label: 'What needs to happen', type: 'textarea', rows: 2, required: true, full: true },
      { name: 'owner', label: 'Owner', type: 'text', required: true, suggest: peopleNames() },
      { name: 'due_date', label: 'Due date', type: 'date', required: true },
      { name: 'project_id', label: 'Project', type: 'select', blank: 'None (general)', options: projectOptions((p) => p.category !== 'archived') },
      { name: 'topic', label: 'Topic (if no project)', type: 'text', suggest: ['Fundraising', 'Team & admin', 'Wellness', 'Board'] },
      { name: 'status', label: 'Status', type: 'select', blank: false, options: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }] }
    ],
    values: a,
    onSave: (v) => save('actions', { ...a, ...v, project_id: v.project_id || null, done_at: v.status === 'done' ? (a.done_at || new Date().toISOString()) : null }),
    onDelete: id ? () => remove('actions', id) : null
  });
}

// ---------------- impact ----------------
export function impactForm(id, defaults = {}) {
  const r = id ? state.data.impact.find((x) => x.id === id) : { status: 'Missing', tier: 'Trained', ...defaults };
  if (!r) return;
  openForm({
    title: id ? 'Edit impact number' : 'Add impact number',
    fields: [
      { name: 'project_id', label: 'Project', type: 'select', required: true, options: projectOptions((p) => !p.is_placeholder) },
      { name: 'tier', label: 'Tier', type: 'select', blank: false, options: [{ value: 'Trained', label: 'Trained (enrolled or completed)' }, { value: 'Engaged', label: 'Engaged (attended an event or talk)' }, { value: 'Reached online', label: 'Reached online (views, followers)' }] },
      { name: 'count', label: 'Number', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', blank: false, options: ['Verified', 'Estimated', 'Missing'] },
      { name: 'source', label: 'Source', type: 'text', placeholder: 'e.g. CCPD report, sign-in sheet, YouTube analytics' },
      { name: 'as_of', label: 'As of', type: 'date' },
      { name: 'note', label: 'Note', type: 'textarea', full: true, rows: 2 }
    ],
    values: r,
    onSave: (v) => save('impact', { ...r, ...v }),
    onDelete: id ? () => remove('impact', id) : null
  });
}

// ---------------- fundraising ----------------
export function giftForm(id, defaults = {}) {
  const g = id ? state.data.gifts.find((x) => x.id === id) : { stage: 'Cultivating', ...defaults };
  if (!g) return;
  openForm({
    title: id ? `Edit ${g.donor}` : 'Add donor or funder',
    subtitle: 'Editors only. Not visible to the shared viewer account.',
    fields: [
      { name: 'donor', label: 'Donor or funder', type: 'text', required: true, full: true },
      { name: 'stage', label: 'Stage', type: 'select', blank: false, options: GIFT_STAGES },
      { name: 'amount_text', label: 'Amount', type: 'text', placeholder: 'e.g. $50K/year for 5 years' },
      { name: 'project_id', label: 'For project', type: 'select', blank: 'Unrestricted / not set', options: projectOptions((p) => p.category !== 'archived' && !p.is_placeholder) },
      { name: 'owner', label: 'Owner', type: 'text', suggest: peopleNames() },
      { name: 'next_step', label: 'Next step', type: 'text' },
      { name: 'next_date', label: 'Next step date', type: 'date' },
      { name: 'description', label: 'Description', type: 'textarea', full: true },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true }
    ],
    values: g,
    onSave: (v) => save('gifts', { ...g, ...v, project_id: v.project_id || null }),
    onDelete: id ? () => remove('gifts', id) : null
  });
}
