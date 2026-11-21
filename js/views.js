// Tab views. Each returns HTML; clicks are handled in app.js through data-* attributes.
import { state, isEditor } from './store.js';
import { esc, parseDate, isoDate, today, addDays, addMonths, monthPos, fmtDate, fmtRange, MONTH_SHORT, MONTH_LONG, WEEKDAY, initials, daysBetween } from './util.js';
import {
  STAGES, STAGE_STYLE, PILLARS, CATEGORIES, EVENT_GROUP, GIFT_STAGES, QUICK, projectTree, phasesOf, datesOf, eventsOf,
  currentStage, eventTags, upcoming, attention, meetingOccurrences, unscheduledMeetings, lastClosedMeeting, rangeStart,
  projectsById, shortName
} from './model.js';

export const ui = {
  tab: 'timeline', range: 'fiscal', lead: '', host: 'all', tag: '', calMonth: null, calMode: 'month', calDay: null,
  calShow: { meeting: true, event: true, outside: true, deadline: true, action: true },
  actOwner: '', actStatus: 'open', dlDays: 30, meetingKey: null, topicFilter: 'all',
  flipped: loadFlipped() // projects whose fold state differs from the default
};

// Long sub-lists (5 or more items, e.g. ME-ME 207.01 students) start folded.
export const FOLD_AT = 5;
function loadFlipped() { try { return new Set(JSON.parse(localStorage.getItem('planning-flipped') || '[]')); } catch { return new Set(); } }
export function toggleFold(id) {
  if (ui.flipped.has(id)) ui.flipped.delete(id); else ui.flipped.add(id);
  try { localStorage.setItem('planning-flipped', JSON.stringify([...ui.flipped])); } catch { /* storage unavailable */ }
}
function childCounts() {
  const m = new Map();
  for (const p of state.data.projects) if (p.parent_id) m.set(p.parent_id, (m.get(p.parent_id) || 0) + 1);
  return m;
}
const isFolded = (id, counts) => ((counts.get(id) || 0) >= FOLD_AT) !== ui.flipped.has(id);

const pct = (m) => `${(Math.max(0, Math.min(12, m)) / 12 * 100).toFixed(3)}%`;

// ---------------- shared pieces ----------------
function monthHeader(start, labelCol = 'Project · Lead') {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  return `<div class="tl-head"><div class="tl-name-col">${esc(labelCol)}</div><div class="tl-months">${months.map((m) => `<div>${MONTH_SHORT[m.getMonth()]}${m.getMonth() === 0 || m === months[0] ? ` <span class="yr">${String(m.getFullYear()).slice(2)}</span>` : ''}</div>`).join('')}</div></div>`;
}

function todayLine(start) {
  const pos = monthPos(start, today());
  return pos >= 0 && pos <= 12 ? `<div class="today-line" style="left:${pct(pos)}" aria-hidden="true"></div>` : '';
}

function barHtml(start, ph) {
  const s = monthPos(start, parseDate(ph.start_date));
  const e = monthPos(start, addDays(parseDate(ph.end_date), 1));
  if (e < 0 || s > 12) return '';
  const st = STAGE_STYLE[ph.stage] || STAGE_STYLE.Planning;
  const cls = ph.stage === 'Ongoing' ? 'bar bar-ongoing' : 'bar';
  const label = ph.label || ph.stage;
  return `<div class="${cls}" style="left:${pct(s)};width:calc(${pct(e)} - ${pct(s)});background:${st.bg};color:${st.fg}" title="${esc(`${ph.stage}: ${label} (${fmtRange(ph.start_date, ph.end_date)})`)}"><span>${esc(ph.label || '')}</span></div>`;
}

function markHtml(start, on, label, { open = '', kind = 'key', tentative = false, done = false } = {}) {
  const pos = monthPos(start, parseDate(on));
  if (pos < 0 || pos > 12) return '';
  const cls = `mark mark-${kind}${tentative ? ' mark-tbc' : ''}${done ? ' mark-done' : ''}`;
  const text = `${label}, ${fmtDate(on, true)}${tentative ? ' (to confirm)' : ''}${done ? ' (done)' : ''}`;
  return `<button type="button" class="${cls}" style="left:${pct(pos)}" data-open="${esc(open)}" title="${esc(text)}" aria-label="${esc(text)}"></button>`;
}

function pillarDot(p, depth) {
  if (depth > 0) return '<span class="sub-dash" aria-hidden="true"></span>';
  const c = PILLARS[p.pillar];
  return `<span class="pdot" aria-hidden="true" style="${c ? `background:${c}` : 'background:#fff;border:1px solid #656C71'}"></span>`;
}

function sideLists() {
  const up = upcoming(30).filter((i) => i.kind !== 'action').slice(0, 8);
  const att = attention().slice(0, 8);
  return `<aside class="side">
    <section class="panel pad"><h2 class="h2">Next 30 Days</h2><p class="muted small">For Wednesday's admin meeting</p>
      ${up.length ? `<ul class="datelist">${up.map(dateItem).join('')}</ul>` : '<p class="muted">Nothing in the next 30 days.</p>'}
      <button type="button" class="link-btn" data-tab="deadlines">All deadlines</button></section>
    <section class="panel pad attention"><h2 class="h2">Needs Attention</h2>
      ${att.length ? `<ul class="att">${att.map((a) => `<li><strong>${esc(a.what)}</strong> ${esc(a.detail)}${a.pid ? ` <button type="button" class="link-btn" data-open="project:${a.pid}">Open</button>` : a.tab ? ` <button type="button" class="link-btn" data-tab="${a.tab}">View</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">All clear.</p>'}</section>
  </aside>`;
}

function dateItem(i) {
  return `<li><div class="cal-chip"><span>${MONTH_SHORT[i.date.getMonth()]}</span><b>${i.date.getDate()}</b></div><div><div>${esc(i.what)}</div><div class="muted small">${esc(i.who)}</div></div></li>`;
}

// ---------------- Timeline ----------------
export function timelineView() {
  const start = rangeStart(ui.range);
  const end = addDays(addMonths(start, 12), -1);
  const lead = ui.lead.toLowerCase();
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const p of state.data.projects) {
    if (!['active', 'pipeline'].includes(p.category) || p.is_placeholder) continue;
    const s = currentStage(p.id);
    if (s && phasesOf(p.id).some((ph) => ph.stage !== 'Ongoing' && parseDate(ph.start_date) <= today() && parseDate(ph.end_date) >= today())) counts[s]++;
  }
  const groups = ['active', 'pipeline', 'standing'].map((cat) => {
    let rows = projectTree(cat);
    if (lead) {
      const keep = new Set();
      const map = projectsById();
      for (const { p } of rows) if ((p.leads || '').toLowerCase().includes(lead)) { keep.add(p.id); let q = p; while (q.parent_id && map.get(q.parent_id)) { q = map.get(q.parent_id); keep.add(q.id); } }
      rows = rows.filter(({ p }) => keep.has(p.id));
    }
    const main = rows.filter(({ p, depth }) => depth === 0 && !p.is_placeholder).length;
    const counts = childCounts();
    const visible = [];
    let hideBelow = null;
    for (const r of rows) {
      if (hideBelow !== null && r.depth > hideBelow) continue;
      hideBelow = null;
      visible.push(r);
      if ((counts.get(r.p.id) || 0) && isFolded(r.p.id, counts)) hideBelow = r.depth;
    }
    return `<div class="tl-group"><div class="tl-group-head"><h3>${esc(CATEGORIES[cat].name)}</h3><span>${esc(CATEGORIES[cat].desc)} · ${main} item${main === 1 ? '' : 's'}</span>
      ${isEditor() ? `<button type="button" class="link-btn" data-add="project:${cat}">+ Add</button>` : ''}</div>
      ${visible.map(({ p, depth }) => tlRow(start, p, depth, counts)).join('') || '<div class="tl-empty">No items match.</div>'}</div>`;
  }).join('');
  const total = state.data.projects.filter((p) => p.category !== 'archived' && !p.is_placeholder && !p.parent_id).length;
  return `
  <div class="stage-cards">${STAGES.map((s) => `<div class="stage-card"><span class="swatch-tall" style="background:${STAGE_STYLE[s].bg}"></span><div><b>${counts[s]}</b><span>${s === 'Delivery' ? 'Delivery (active now)' : s}</span></div></div>`).join('')}</div>
  <div class="two-col">
    <section class="panel tl" aria-label="Timeline"><div class="tl-scroll"><div class="tl-inner">
      ${monthHeader(start)}${groups}
      <div class="legend"><b>Stage</b>${STAGES.map((s) => `<span><i class="sw" style="background:${STAGE_STYLE[s].bg}"></i>${s}</span>`).join('')}
        <span><i class="sw sw-ongoing"></i>Ongoing (standing)</span><span><i class="dia"></i>Key date or event</span><span><i class="dia dia-dl"></i>Deadline</span><span><i class="tline"></i>Today, ${fmtDate(today())}</span></div>
      <div class="legend"><b>Pillar</b>${Object.entries(PILLARS).map(([n, c]) => `<span><i class="pdot" style="background:${c}"></i>${n}</span>`).join('')}<span class="muted">${total} projects and programs · ${fmtDate(start, true)} to ${fmtDate(end, true)}</span></div>
    </div></div></section>
    ${sideLists()}
  </div>`;
}

function tlRow(start, p, depth, counts = new Map()) {
  const n = counts.get(p.id) || 0;
  const folded = n > 0 && isFolded(p.id, counts);
  let bars = phasesOf(p.id).map((ph) => barHtml(start, ph)).join('');
  if (folded) {
    // a thin strip showing when each folded sub-item happens
    const kids = state.data.projects.filter((k) => k.parent_id === p.id);
    bars += kids.flatMap((k) => phasesOf(k.id).map((ph) => {
      const s = monthPos(start, parseDate(ph.start_date)), e = monthPos(start, addDays(parseDate(ph.end_date), 1));
      if (e < 0 || s > 12) return '';
      return `<span class="mini" style="left:${pct(s)};width:calc(${pct(e)} - ${pct(s)});background:${(STAGE_STYLE[ph.stage] || STAGE_STYLE.Planning).bg}" title="${esc(`${k.name}: ${fmtRange(ph.start_date, ph.end_date)}`)}"></span>`;
    })).join('');
  }
  const fold = n ? `<button type="button" class="fold" data-fold="${p.id}" aria-expanded="${!folded}" aria-label="${folded ? 'Show' : 'Hide'} ${n} items under ${esc(p.name)}"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${folded ? 0 : 90}deg)"><path d="M9 6l6 6-6 6"/></svg><span>${n}</span></button>` : '';
  const marks = datesOf(p.id).map((d) => markHtml(start, d.on_date, d.label, { open: `project:${p.id}`, kind: d.kind, tentative: d.tentative, done: d.done })).join('')
    + eventsOf(p.id).filter((e) => e.start_date).map((e) => markHtml(start, e.start_date, e.name, { open: `event:${e.id}`, kind: 'event', tentative: e.tentative })).join('');
  return `<div class="tl-row${p.is_placeholder ? ' is-ph' : ''}">
    <div class="tl-name" style="padding-left:${16 + depth * 24}px">
      <span class="tl-title">${pillarDot(p, depth)}<button type="button" class="name-link" data-open="project:${p.id}">${esc(p.name)}</button>${fold}</span>
      <span class="tl-lead">${esc(p.leads || '')}${p.flag ? ` <span class="flag">${esc(p.flag)}</span>` : ''}${p.seeking_support ? ' <span class="flag flag-support">Seeking support</span>' : ''}</span>
    </div>
    <div class="tl-track">${todayLine(start)}${bars}${marks}${p.timeline_note ? `<span class="tl-note">${esc(p.timeline_note)}</span>` : ''}</div>
  </div>`;
}

// ---------------- Events ----------------
export function eventsView() {
  const start = rangeStart(ui.range);
  const map = projectsById();
  let evs = state.data.events.slice();
  if (ui.host !== 'all') evs = evs.filter((e) => e.host === ui.host);
  if (ui.tag) evs = evs.filter((e) => (ui.tag === 'Center team' ? (e.extra_tags || []).includes('Center team') : (e.project_ids || []).includes(ui.tag)));
  const tagOptions = [...new Set(state.data.events.flatMap((e) => e.project_ids || []))].map((id) => map.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const groups = Object.entries(EVENT_GROUP).map(([type, title]) => {
    const list = evs.filter((e) => e.event_type === type);
    const rowsMap = new Map();
    for (const e of list) { const k = e.name; if (!rowsMap.has(k)) rowsMap.set(k, []); rowsMap.get(k).push(e); }
    const rows = [...rowsMap.values()].map((items) => items.sort((a, b) => (a.start_date || '9').localeCompare(b.start_date || '9')))
      .sort((a, b) => (a[0].start_date || '9').localeCompare(b[0].start_date || '9'));
    return `<div class="tl-group"><div class="tl-group-head"><h3>${esc(title)}</h3><span>${rows.length} event${rows.length === 1 ? '' : 's'}</span>${isEditor() ? `<button type="button" class="link-btn" data-add="event:${type}">+ Add</button>` : ''}</div>
      ${rows.map((items) => evRow(start, items)).join('') || '<div class="tl-empty">No events.</div>'}</div>`;
  }).join('');
  const nextUp = state.data.events.filter((e) => e.start_date && parseDate(e.start_date) >= today()).sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 6);
  return `
  <div class="filters panel">
    <div class="seg" role="group" aria-label="Host">${[['all', 'All'], ['CEWM', 'Hosted by CEWM'], ['Outside', 'Outside']].map(([v, l]) => `<button type="button" aria-pressed="${ui.host === v}" data-set="host:${v}">${l}</button>`).join('')}</div>
    <label for="tagsel" class="muted">Project tag</label>
    <select id="tagsel" data-set-select="tag"><option value="">All projects</option>${tagOptions.map((p) => `<option value="${p.id}"${ui.tag === p.id ? ' selected' : ''}>${esc(shortName(p.name))}</option>`).join('')}<option value="Center team"${ui.tag === 'Center team' ? ' selected' : ''}>Center team</option></select>
    ${isEditor() ? '<button type="button" class="btn btn-primary push-right" data-add="event:Gathering">+ Add event</button>' : ''}
  </div>
  <div class="two-col">
    <section class="panel tl" aria-label="Events timeline"><div class="tl-scroll"><div class="tl-inner">
      ${monthHeader(start, 'Event · Project tags')}${groups}
      <div class="legend"><span><i class="dia dia-ev"></i>Event date</span><span><i class="dia dia-tbc"></i>Date to confirm</span><span><i class="dia dia-dl"></i>Deadline (abstract, registration, travel approval)</span><span><i class="sw" style="background:#8BB8E8"></i>Planning window</span><span><i class="tline"></i>Today</span></div>
    </div></div></section>
    <aside class="side"><section class="panel pad"><h2 class="h2">Coming Up</h2>
      ${nextUp.length ? `<ul class="datelist">${nextUp.map((e) => dateItem({ date: parseDate(e.start_date), what: e.name + (e.tentative ? ' (to confirm)' : ''), who: eventTags(e).join(' · ') })).join('')}</ul>` : '<p class="muted">No upcoming events.</p>'}</section></aside>
  </div>`;
}

function tagChips(e) {
  return eventTags(e).map((t) => `<span class="tag${t === 'Outside' ? ' tag-out' : ''}">${esc(shortName(t))}</span>`).join('');
}

function evRow(start, items) {
  const e0 = items.find((e) => e.start_date && parseDate(e.start_date) >= today()) || items[0];
  const bars = [], marks = [];
  for (const e of items) {
    if (e.planning_start && e.start_date) bars.push(barHtml(start, { stage: 'Planning', label: 'Planning', start_date: e.planning_start, end_date: isoDate(addDays(parseDate(e.start_date), -1)) }));
    else if (e.planning_start && !e.start_date) bars.push(barHtml(start, { stage: 'Planning', label: 'Planning', start_date: e.planning_start, end_date: isoDate(addMonths(parseDate(e.planning_start), 1)) }));
    if (e.start_date && e.end_date && e.end_date !== e.start_date) {
      const s = monthPos(start, parseDate(e.start_date)), en = monthPos(start, addDays(parseDate(e.end_date), 1));
      if (en >= 0 && s <= 12) bars.push(`<button type="button" class="bar bar-event${e.host === 'Outside' ? ' bar-out' : ''}" data-open="event:${e.id}" style="left:${pct(s)};width:calc(${pct(en)} - ${pct(s)})" title="${esc(e.name + ', ' + fmtRange(e.start_date, e.end_date))}" aria-label="${esc(e.name + ', ' + fmtRange(e.start_date, e.end_date))}"></button>`);
    } else if (e.start_date) marks.push(markHtml(start, e.start_date, e.name + (e.start_time ? ` ${e.start_time}` : ''), { open: `event:${e.id}`, kind: 'event', tentative: e.tentative }));
    for (const d of state.data.dates.filter((x) => x.event_id === e.id)) marks.push(markHtml(start, d.on_date, d.label, { open: `event:${e.id}`, kind: 'deadline', tentative: d.tentative, done: d.done }));
  }
  const when = items.length > 1 ? `${items.length} sessions` : (e0.start_date ? `${fmtRange(e0.start_date, e0.end_date)}${e0.start_time ? ', ' + e0.start_time : ''}` : '') + (e0.when_text ? `${e0.start_date ? ' · ' : ''}${e0.when_text}` : '') + (e0.location ? ` · ${e0.location}` : '');
  const off = items.every((e) => !e.start_date || monthPos(start, parseDate(e.start_date)) > 12 || monthPos(start, parseDate(e.start_date)) < 0);
  const note = off ? (e0.start_date ? fmtDate(e0.start_date, true) : e0.when_text || 'Date TBD') : '';
  return `<div class="tl-row ev-row"><div class="tl-name"><button type="button" class="name-link" data-open="event:${e0.id}">${esc(e0.name)}</button>
    <span class="tag-line">${tagChips(e0)}<span class="muted small">${esc(when)}</span></span></div>
    <div class="tl-track">${todayLine(start)}${bars.join('')}${marks.join('')}${note ? `<span class="tl-note">${esc(note)}</span>` : ''}</div></div>`;
}

// ---------------- Calendar ----------------
function calItems(from, to) {
  const items = [];
  const map = projectsById();
  if (ui.calShow.meeting) for (const o of meetingOccurrences(from, to)) {
    items.push({ date: o.date, kind: 'meeting', label: o.meeting.title.replace(/, [A-Z][a-z]{2}\.? \d+$/, ''), time: o.meeting.start_time || '', tentative: o.meeting.tentative, open: o.series ? `occ:${o.meeting.id}:${isoDate(o.date)}` : `meeting:${o.meeting.id}`, sub: o.meeting.location || '' });
  }
  for (const e of state.data.events) {
    if (!e.start_date) continue;
    const kind = e.host === 'Outside' ? 'outside' : 'event';
    if (!ui.calShow[kind]) continue;
    for (let d = parseDate(e.start_date); d <= parseDate(e.end_date || e.start_date); d = addDays(d, 1)) {
      if (d >= from && d <= to) items.push({ date: d, kind, label: e.name, time: e.start_time || '', tentative: e.tentative, open: `event:${e.id}`, sub: eventTags(e).join(' · ') });
    }
  }
  if (ui.calShow.deadline) for (const d of state.data.dates) {
    const on = parseDate(d.on_date);
    if (on < from || on > to) continue;
    const ev = d.event_id && state.data.events.find((e) => e.id === d.event_id);
    items.push({ date: on, kind: d.kind === 'deadline' ? 'deadline' : 'key', label: d.label, time: '', tentative: d.tentative, done: d.done, open: ev ? `event:${ev.id}` : `project:${d.project_id}`, sub: ev ? ev.name : map.get(d.project_id)?.name || '' });
  }
  if (ui.calShow.action) for (const a of state.data.actions) {
    if (a.status !== 'open' || !a.due_date) continue;
    const on = parseDate(a.due_date);
    if (on >= from && on <= to) items.push({ date: on, kind: 'action', label: a.what, time: '', open: `action:${a.id}`, sub: a.owner || '' });
  }
  return items.sort((a, b) => a.date - b.date || a.kind.localeCompare(b.kind));
}

const CAL_TYPES = [['meeting', 'Meetings'], ['event', 'Events'], ['outside', 'Outside events'], ['deadline', 'Deadlines & key dates'], ['action', 'Action items due']];

export function calendarView() {
  if (!ui.calMonth) ui.calMonth = new Date(today().getFullYear(), today().getMonth(), 1);
  const m = ui.calMonth;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  const items = calItems(first, last);
  const byDay = new Map();
  for (const it of items) { const k = isoDate(it.date); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(it); }
  const selected = ui.calDay && parseDate(ui.calDay).getMonth() === m.getMonth() ? ui.calDay : null;
  let body = '';
  if (ui.calMode === 'month') {
    const lead = first.getDay();
    const total = Math.ceil((lead + last.getDate()) / 7) * 7;
    const cells = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(m.getFullYear(), m.getMonth(), i - lead + 1);
      const inMonth = d.getMonth() === m.getMonth();
      const k = isoDate(d);
      const list = inMonth ? byDay.get(k) || [] : [];
      const isToday = k === isoDate(today());
      cells.push(`<div class="cal-cell${inMonth ? '' : ' out'}${[0, 6].includes(d.getDay()) ? ' wkend' : ''}${selected === k ? ' sel' : ''}">
        ${inMonth ? `<button type="button" class="cal-num${isToday ? ' is-today' : ''}" data-calday="${k}" aria-label="${esc(fmtDate(d, true))}, ${list.length} item${list.length === 1 ? '' : 's'}">${d.getDate()}</button>` : ''}
        ${list.slice(0, 4).map(calPill).join('')}${list.length > 4 ? `<button type="button" class="more" data-calday="${k}">+${list.length - 4} more</button>` : ''}</div>`);
    }
    body = `<div class="cal-scroll"><div class="cal-grid-wrap"><div class="cal-week">${WEEKDAY.map((w) => `<div>${w}</div>`).join('')}</div><div class="cal-grid">${cells.join('')}</div></div></div>`;
  } else {
    const days = [...byDay.entries()];
    body = days.length ? `<ol class="cal-list">${days.map(([k, list]) => `<li><h3>${WEEKDAY[parseDate(k).getDay()]}, ${esc(fmtDate(k))}</h3><ul>${list.map((it) => `<li>${calPill(it)}${it.sub ? `<span class="muted small"> ${esc(it.sub)}</span>` : ''}</li>`).join('')}</ul></li>`).join('')}</ol>` : '<p class="pad muted">Nothing this month.</p>';
  }
  const dayList = selected ? byDay.get(selected) || [] : [];
  const unsched = unscheduledMeetings();
  return `
  <div class="filters panel">
    <div class="seg" role="group" aria-label="Calendar layout">${[['month', 'Month'], ['list', 'List']].map(([v, l]) => `<button type="button" aria-pressed="${ui.calMode === v}" data-set="calMode:${v}">${l}</button>`).join('')}</div>
    <div class="cal-filters">${CAL_TYPES.map(([k, l]) => `<label class="check"><input type="checkbox" data-calshow="${k}"${ui.calShow[k] ? ' checked' : ''}><i class="sw cal-sw-${k}"></i>${l}</label>`).join('')}</div>
    <div class="push-right row-gap">
      <button type="button" class="btn" data-do="ics-export">Download for Outlook (.ics)</button>
      ${isEditor() ? '<button type="button" class="btn" data-do="ics-import">Import .ics</button><button type="button" class="btn btn-primary" data-add="meeting:">+ Add meeting</button>' : ''}
    </div>
  </div>
  <div class="two-col">
    <section class="panel" aria-labelledby="cal-h">
      <div class="cal-bar"><button type="button" class="btn-icon bordered" data-calnav="-1" aria-label="Previous month"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
        <h2 id="cal-h" class="h2">${MONTH_LONG[m.getMonth()]} ${m.getFullYear()}</h2>
        <button type="button" class="btn-icon bordered" data-calnav="1" aria-label="Next month"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
        <button type="button" class="btn" data-calnav="0">Today</button></div>
      ${body}
    </section>
    <aside class="side">
      <section class="panel pad"><h2 class="h2">${selected ? `${WEEKDAY[parseDate(selected).getDay()]}, ${esc(fmtDate(selected))}` : 'Select a day'}</h2>
        ${selected ? (dayList.length ? `<ul class="day-list">${dayList.map((it) => `<li>${calPill(it)}${it.sub ? `<div class="muted small">${esc(it.sub)}</div>` : ''}${it.kind === 'meeting' ? `<button type="button" class="link-btn" data-meetinggo="${esc(it.open)}">Open in Meeting tab</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nothing scheduled.</p>') : '<p class="muted">Click a date to see its meetings, events and deadlines.</p>'}
        ${selected && isEditor() ? `<div class="row-gap"><button type="button" class="btn btn-small" data-add="meeting:${selected}">+ Meeting</button><button type="button" class="btn btn-small" data-add="eventdate:${selected}">+ Event</button></div>` : ''}</section>
      <section class="panel pad attention"><h2 class="h2">To Schedule</h2><p class="muted small">Meetings with no date yet</p>
        ${unsched.length ? `<ul class="att">${unsched.map((mt) => `<li><button type="button" class="name-link" data-open="meeting:${mt.id}">${esc(mt.title)}</button></li>`).join('')}</ul>` : '<p class="muted">None.</p>'}</section>
    </aside>
  </div>`;
}

function calPill(it) {
  return `<button type="button" class="pill pill-${it.kind}${it.tentative ? ' pill-tbc' : ''}${it.done ? ' pill-done' : ''}" data-open="${esc(it.open)}" title="${esc(it.label + (it.tentative ? ' (to confirm)' : ''))}">${it.time ? `<b>${esc(it.time)}</b> ` : ''}${esc(it.label)}</button>`;
}

// ---------------- Board ----------------
export function boardView() {
  const cols = [...STAGES, 'No stage set'];
  const cards = Object.fromEntries(cols.map((c) => [c, []]));
  for (const cat of ['active', 'pipeline']) for (const { p, depth } of projectTree(cat)) {
    if (p.is_placeholder) continue;
    if (depth > 0 && !phasesOf(p.id).length) continue;
    cards[currentStage(p.id) || 'No stage set'].push(p);
  }
  const map = projectsById();
  return `<div class="board">${cols.map((c) => `<section class="board-col" aria-label="${esc(c)}"><h2 class="board-h"><i class="sw" style="background:${STAGE_STYLE[c]?.bg || '#fff'}"></i>${esc(c)} <span class="muted">${cards[c].length}</span></h2>
    ${cards[c].map((p) => `<button type="button" class="card" data-open="project:${p.id}"><span class="card-title">${pillarDot(p, 0)}${esc(p.name)}</span>
      ${p.parent_id && map.get(p.parent_id) ? `<span class="muted small">Part of ${esc(shortName(map.get(p.parent_id).name))}</span>` : ''}
      <span class="small">${esc(p.leads || '')}</span>${p.category === 'pipeline' ? '<span class="tag">Pipeline</span>' : ''}${p.flag ? `<span class="flag">${esc(p.flag)}</span>` : ''}</button>`).join('') || '<p class="muted small pad-s">None</p>'}</section>`).join('')}</div>`;
}

// ---------------- Deadlines ----------------
export function deadlinesView() {
  const list = upcoming(ui.dlDays);
  const groups = new Map();
  for (const i of list) { const k = `${MONTH_LONG[i.date.getMonth()]} ${i.date.getFullYear()}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
  const KIND = { deadline: 'Deadline', key: 'Key date', event: 'Event', action: 'Action due' };
  return `<div class="filters panel"><div class="seg" role="group" aria-label="Range">${[30, 60, 90, 180].map((n) => `<button type="button" aria-pressed="${ui.dlDays === n}" data-set="dlDays:${n}">Next ${n} days</button>`).join('')}</div>
    <button type="button" class="btn push-right" data-do="print">Print for meeting</button></div>
    <section class="panel pad">${groups.size ? [...groups.entries()].map(([k, items]) => `<h2 class="h2">${esc(k)}</h2><table class="table"><thead><tr><th scope="col">Date</th><th scope="col">What</th><th scope="col">Project or event</th><th scope="col">Kind</th><th scope="col">In</th></tr></thead><tbody>
      ${items.map((i) => `<tr><td class="nowrap">${WEEKDAY[i.date.getDay()]}, ${esc(fmtDate(i.date))}</td><td>${esc(i.what)}</td><td>${esc(i.who)}</td><td><span class="kind kind-${i.kind}">${KIND[i.kind]}</span></td><td class="nowrap muted">${daysBetween(today(), i.date)} days</td></tr>`).join('')}</tbody></table>`).join('') : '<p class="muted">Nothing in this range.</p>'}</section>`;
}

// ---------------- Action items ----------------
export function actionsView() {
  const map = projectsById();
  const owners = [...new Set(state.data.actions.map((a) => a.owner).filter(Boolean))].sort();
  let list = state.data.actions.slice();
  if (ui.actStatus !== 'all') list = list.filter((a) => a.status === ui.actStatus);
  if (ui.actOwner) list = list.filter((a) => a.owner === ui.actOwner);
  list.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const meetings = new Map(state.data.meetings.map((m) => [m.id, m]));
  return `<div class="filters panel">
    <div class="seg" role="group" aria-label="Status">${[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([v, l]) => `<button type="button" aria-pressed="${ui.actStatus === v}" data-set="actStatus:${v}">${l}</button>`).join('')}</div>
    <label for="ownsel" class="muted">Owner</label><select id="ownsel" data-set-select="actOwner"><option value="">Everyone</option>${owners.map((o) => `<option${ui.actOwner === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>
    ${isEditor() ? '<button type="button" class="btn btn-primary push-right" data-add="action:">+ Add action item</button>' : ''}</div>
  <section class="panel"><table class="table table-actions"><thead><tr><th scope="col"><span class="sr">Done</span></th><th scope="col">Action</th><th scope="col">Owner</th><th scope="col">Due</th><th scope="col">Project or topic</th><th scope="col">From meeting</th></tr></thead><tbody>
    ${list.map((a) => {
      const overdue = a.status === 'open' && a.due_date && parseDate(a.due_date) < today();
      const m = meetings.get(a.meeting_id);
      return `<tr class="${a.status === 'done' ? 'is-done' : ''}"><td><input type="checkbox" aria-label="Mark done: ${esc(a.what)}" data-toggle-action="${a.id}"${a.status === 'done' ? ' checked' : ''}${isEditor() ? '' : ' disabled'}></td>
        <td><button type="button" class="name-link" data-open="action:${a.id}">${esc(a.what)}</button></td>
        <td>${a.owner ? esc(a.owner) : '<span class="warn">No owner</span>'}</td>
        <td class="nowrap">${a.due_date ? `<span class="${overdue ? 'warn' : ''}">${esc(fmtDate(a.due_date))}${overdue ? ' · overdue' : ''}</span>` : '<span class="warn">No date</span>'}</td>
        <td>${esc(map.get(a.project_id)?.name || a.topic || '')}</td><td class="muted small">${esc(m ? (m.meeting_date ? fmtDate(m.meeting_date) : m.title) : '')}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">No action items.</td></tr>'}</tbody></table></section>`;
}

// ---------------- Fundraising ----------------
export function fundraisingView() {
  if (!isEditor()) return '<section class="panel pad"><p>Fundraising is visible to editors only.</p></section>';
  const map = projectsById();
  return `<div class="filters panel"><p class="muted">Editors only. Donor names and amounts are hidden from the shared viewer account.</p><button type="button" class="btn btn-primary push-right" data-add="gift:">+ Add donor or funder</button></div>
  <div class="board">${GIFT_STAGES.map((s) => { const list = state.data.gifts.filter((g) => g.stage === s); return `<section class="board-col"><h2 class="board-h">${esc(s)} <span class="muted">${list.length}</span></h2>
    ${list.map((g) => `<button type="button" class="card" data-open="gift:${g.id}"><span class="card-title">${esc(g.donor)}</span>${g.amount_text ? `<span class="small"><b>${esc(g.amount_text)}</b></span>` : ''}${g.project_id ? `<span class="tag">${esc(shortName(map.get(g.project_id)?.name || ''))}</span>` : ''}
      ${g.next_step ? `<span class="small">Next: ${esc(g.next_step)}${g.next_date ? `, ${esc(fmtDate(g.next_date))}` : ''}</span>` : ''}${g.owner ? `<span class="muted small">${esc(g.owner)}</span>` : ''}</button>`).join('') || '<p class="muted small pad-s">None</p>'}</section>`; }).join('')}</div>`;
}

// ---------------- Impact ----------------
export function impactView() {
  const map = projectsById();
  const rows = state.data.impact.slice().sort((a, b) => ({ Missing: 0, Estimated: 1, Verified: 2 }[a.status] - { Missing: 0, Estimated: 1, Verified: 2 }[b.status]) || (map.get(a.project_id)?.name || '').localeCompare(map.get(b.project_id)?.name || ''));
  const totals = { Trained: 0, Engaged: 0, 'Reached online': 0 };
  for (const r of state.data.impact) if (r.status === 'Verified' && r.count) totals[r.tier] += r.count;
  const pastEvents = state.data.events.filter((e) => e.host === 'CEWM' && e.start_date && parseDate(e.end_date || e.start_date) < today());
  return `<div class="stage-cards">${Object.entries(totals).map(([t, n]) => `<div class="stage-card"><div><b>${n.toLocaleString()}</b><span>${esc(t)} (verified)</span></div></div>`).join('')}
    <div class="stage-card"><div><b>${state.data.impact.filter((r) => r.status === 'Missing').length}</b><span>Numbers missing</span></div></div></div>
  <div class="filters panel"><p class="muted">Only verified numbers should go into donor materials. Each number needs a source and an "as of" date.</p>${isEditor() ? '<button type="button" class="btn btn-primary push-right" data-add="impact:">+ Add number</button>' : ''}</div>
  <div class="two-col"><section class="panel"><table class="table"><thead><tr><th scope="col">Project</th><th scope="col">Tier</th><th scope="col">Number</th><th scope="col">Status</th><th scope="col">Source</th><th scope="col">As of</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><button type="button" class="name-link" data-open="impact:${r.id}">${esc(map.get(r.project_id)?.name || '')}</button></td><td>${esc(r.tier)}</td><td>${r.count != null ? r.count.toLocaleString() : '—'}</td><td><span class="status status-${r.status.toLowerCase()}">${esc(r.status)}</span></td><td>${esc(r.source || '')}</td><td class="nowrap">${esc(r.as_of ? fmtDate(r.as_of, true) : '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No numbers yet.</td></tr>'}</tbody></table></section>
  <aside class="side"><section class="panel pad attention"><h2 class="h2">Past Events: Attendance</h2>
    <ul class="att">${pastEvents.map((e) => `<li><button type="button" class="name-link" data-open="event:${e.id}">${esc(e.name)}</button>, ${esc(fmtDate(e.start_date))}: ${e.attendance != null ? `<b>${e.attendance}</b> attended` : '<span class="warn">not entered</span>'}</li>`).join('') || '<li class="muted">No past events yet.</li>'}</ul></section></aside></div>`;
}

// ---------------- Archived ----------------
export function archivedView() {
  const rows = projectTree('archived');
  return `<section class="panel pad"><h2 class="h2">Archived Programs</h2><p class="muted small">Inactive programs, kept for reference and hidden from the timeline.</p>
    <ul class="archive">${rows.map(({ p }) => `<li><button type="button" class="name-link" data-open="project:${p.id}">${esc(p.name)}</button>${p.leads ? ` <span class="muted small">${esc(p.leads)}</span>` : ''}${isEditor() ? ` <button type="button" class="link-btn" data-restore="${p.id}">Move back to Active</button>` : ''}</li>`).join('') || '<li class="muted">None.</li>'}</ul></section>`;
}

// ---------------- Meeting ----------------
export function meetingChoices() {
  const from = addDays(today(), -42), to = addDays(today(), 28);
  const occ = meetingOccurrences(from, to);
  return occ.map((o) => ({ key: o.series ? `occ:${o.meeting.id}:${isoDate(o.date)}` : `meeting:${o.meeting.id}`, date: o.date, meeting: o.meeting, series: o.series }));
}

export function resolveMeeting(key) {
  if (!key) return null;
  const [kind, id, date] = key.split(':');
  const base = state.data.meetings.find((m) => m.id === id);
  if (!base) return null;
  if (kind === 'meeting') return { instance: base, base, date: base.meeting_date ? parseDate(base.meeting_date) : null };
  const inst = state.data.meetings.find((m) => !m.repeats && m.kind === base.kind && (m.project_id || '') === (base.project_id || '') && m.meeting_date === date);
  return { instance: inst || null, base, date: parseDate(date) };
}

export function meetingView() {
  const choices = meetingChoices();
  if (!ui.meetingKey) {
    const next = choices.find((c) => c.meeting.kind === 'admin' && c.date >= today()) || choices[choices.length - 1];
    ui.meetingKey = next?.key || null;
  }
  const sel = resolveMeeting(ui.meetingKey);
  const online = state.online.filter((o) => o.name);
  const picker = `<div class="filters panel"><label for="mtgsel" class="muted">Meeting</label>
    <select id="mtgsel" data-set-select="meetingKey">${choices.map((c) => `<option value="${esc(c.key)}"${c.key === ui.meetingKey ? ' selected' : ''}>${esc(fmtDate(c.date, true))} · ${esc(c.meeting.title.replace(/, [A-Z][a-z]{2}\.? \d+$/, ''))}${c.date < today() ? '' : c.date.getTime() === today().getTime() ? ' (today)' : ''}</option>`).join('')}</select>
    ${online.length ? `<span class="online" aria-label="Online now">${online.map((o) => `<span class="avatar" title="${esc(o.name + (o.editing ? ' is editing ' + o.editing : ' is viewing'))}">${esc(initials(o.name))}</span>`).join('')}<span class="muted small">${online.filter((o) => o.editing).map((o) => `${esc(o.name)} is editing ${esc(o.editing)}`).join(' · ')}</span></span>` : ''}
    ${isEditor() ? '<button type="button" class="btn push-right" data-add="meeting:">+ Add meeting</button>' : ''}</div>`;
  if (!sel) return picker + '<section class="panel pad"><p>No meetings set up yet. Add the weekly admin meeting (repeats every week) to start.</p></section>';
  const { instance, base, date } = sel;
  const title = instance?.title || `${base.title.replace(/, [A-Z][a-z]{2}\.? \d+$/, '')}, ${fmtDate(date)}`;
  const head = `<section class="panel pad mtg-head"><div><h2 class="h2">${esc(title)}</h2>
      <p class="muted small">${esc([date ? `${WEEKDAY[date.getDay()]}, ${fmtDate(date, true)}` : '', base.start_time && `${base.start_time}${base.end_time ? '–' + base.end_time : ''}`, base.location].filter(Boolean).join(' · '))}${instance?.status === 'closed' ? ' · <b>Closed</b>' : ''}</p></div>
    <div class="row-gap">${!instance && isEditor() ? '<button type="button" class="btn btn-primary" data-do="start-meeting">Start meeting notes</button>' : ''}
      ${instance && isEditor() && instance.status !== 'closed' ? '<button type="button" class="btn btn-primary" data-do="close-meeting">Close meeting</button>' : ''}
      ${instance && instance.status === 'closed' ? '<button type="button" class="btn" data-do="show-summary">Summary</button>' : ''}
      ${instance && isEditor() ? `<button type="button" class="btn" data-open="meeting:${instance.id}">Meeting details</button>` : ''}</div></section>`;

  const map = projectsById();
  const since = lastClosedMeeting(base.kind);
  const sinceTs = since && since.id !== instance?.id ? new Date(since.closed_at || since.meeting_date) : null;
  const openActions = state.data.actions.filter((a) => a.status === 'open').sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const overdue = openActions.filter((a) => a.due_date && parseDate(a.due_date) < today());
  const coming = upcoming(30, date || today());
  const att = attention().filter((a) => a.level >= 1);
  const notes = instance ? state.data.meeting_notes.filter((n) => n.meeting_id === instance.id) : [];
  const editable = isEditor() && instance && instance.status !== 'closed';

  let topics;
  if (base.kind === 'project' && base.project_id) topics = [{ key: base.project_id, name: map.get(base.project_id)?.name || 'Project', pid: base.project_id }];
  else {
    topics = ['active', 'pipeline', 'standing'].flatMap((c) => projectTree(c).filter(({ p, depth }) => depth === 0 && !p.is_placeholder).map(({ p }) => ({ key: p.id, name: p.name, pid: p.id, cat: c })));
    topics.push(...['Fundraising', 'Events', 'Team & admin', 'Other'].map((t) => ({ key: t, name: t, topic: t })));
  }
  const changed = (t) => {
    if (!t.pid || !sinceTs) return false;
    const touch = [map.get(t.pid), ...phasesOf(t.pid), ...datesOf(t.pid)].filter(Boolean).some((r) => r.updated_at && new Date(r.updated_at) > sinceTs);
    return touch;
  };
  const flagged = (t) => t.pid && (map.get(t.pid)?.flag || openActions.some((a) => a.project_id === t.pid));
  const hasNote = (t) => notes.some((n) => (t.pid ? n.project_id === t.pid : n.topic === t.topic));
  let shown = topics;
  if (ui.topicFilter === 'focus') shown = topics.filter((t) => changed(t) || flagged(t) || hasNote(t) || t.topic);

  const topicHtml = shown.map((t) => {
    const n = notes.find((x) => (t.pid ? x.project_id === t.pid : x.topic === t.topic)) || {};
    const acts = openActions.filter((a) => (t.pid ? a.project_id === t.pid : a.topic === t.topic && !a.project_id));
    const p = t.pid ? map.get(t.pid) : null;
    const tid = t.pid || t.topic;
    return `<article class="topic panel" data-topic="${esc(tid)}" data-topic-kind="${t.pid ? 'project' : 'topic'}">
      <header class="topic-head"><h3>${esc(t.name)}</h3>
        ${p ? `<span class="muted small">${esc(p.leads || '')}${currentStage(p.id) ? ' · ' + esc(currentStage(p.id)) : ''}</span>` : ''}
        ${changed(t) ? '<span class="tag tag-changed">Changed since last meeting</span>' : ''}${p?.flag ? `<span class="flag">${esc(p.flag)}</span>` : ''}
        ${p ? `<button type="button" class="link-btn push-right" data-open="project:${p.id}">Open project</button>` : ''}</header>
      ${editable ? `<div class="quick" role="radiogroup" aria-label="Quick status for ${esc(t.name)}">${QUICK.map((q) => `<label class="chip"><input type="radio" name="q-${esc(tid)}" value="${q}"${n.quick_status === q ? ' checked' : ''} data-note-field="quick_status"><span>${q}</span></label>`).join('')}</div>
        <div class="note-grid"><label>Update<textarea rows="2" data-note-field="update_text" placeholder="What changed?">${esc(n.update_text || '')}</textarea></label>
        <label>Decision<input type="text" data-note-field="decision" value="${esc(n.decision || '')}" placeholder="Anything decided?"></label></div>`
        : (n.quick_status || n.update_text || n.decision ? `<p>${n.quick_status ? `<span class="tag">${esc(n.quick_status)}</span> ` : ''}${esc(n.update_text || '')}${n.decision ? `<br><b>Decision:</b> ${esc(n.decision)}` : ''}</p>` : (instance ? '<p class="muted small">No notes.</p>' : ''))}
      ${n.updated_by ? `<p class="muted small saved-by">Last edited by ${esc(n.updated_by)}</p>` : ''}
      <div class="topic-actions">${acts.map((a) => actionLine(a)).join('')}</div>
      ${editable ? `<form class="add-action" data-add-action="${esc(tid)}"><label class="sr" for="aw-${esc(tid)}">New action</label><input id="aw-${esc(tid)}" name="what" placeholder="New action item" required>
        <label class="sr" for="ao-${esc(tid)}">Owner</label><input id="ao-${esc(tid)}" name="owner" placeholder="Owner" list="people" required>
        <label class="sr" for="ad-${esc(tid)}">Due date</label><input id="ad-${esc(tid)}" name="due" type="date" required><button class="btn btn-small" type="submit">Add</button></form>` : ''}
    </article>`;
  }).join('');

  return picker + head + `
  <div class="two-col">
    <div class="mtg-main">
      <div class="filters panel"><div class="seg" role="group" aria-label="Topics">${[['all', 'All topics'], ['focus', 'Changed, flagged or with open items']].map(([v, l]) => `<button type="button" aria-pressed="${ui.topicFilter === v}" data-set="topicFilter:${v}">${l}</button>`).join('')}</div>
        ${!instance ? '<span class="muted small">Agenda preview. Start meeting notes to record updates.</span>' : ''}</div>
      ${topicHtml}
    </div>
    <aside class="side">
      <section class="panel pad attention"><h2 class="h2">Open Action Items</h2><p class="muted small">${openActions.length} open · ${overdue.length} overdue</p>
        <div class="topic-actions">${openActions.slice(0, 12).map((a) => actionLine(a, true)).join('')}</div>
        <button type="button" class="link-btn" data-tab="actions">All action items</button></section>
      <section class="panel pad"><h2 class="h2">Coming Up</h2>${coming.length ? `<ul class="datelist">${coming.slice(0, 8).map(dateItem).join('')}</ul>` : '<p class="muted">Nothing in the next 30 days.</p>'}</section>
      <section class="panel pad"><h2 class="h2">Needs Attention</h2><ul class="att">${att.map((a) => `<li><strong>${esc(a.what)}</strong> ${esc(a.detail)}</li>`).join('') || '<li class="muted">All clear.</li>'}</ul></section>
    </aside>
  </div>`;
}

function actionLine(a, withProject = false) {
  const map = projectsById();
  const overdue = a.due_date && parseDate(a.due_date) < today();
  return `<div class="action-line"><input type="checkbox" aria-label="Mark done: ${esc(a.what)}" data-toggle-action="${a.id}"${a.status === 'done' ? ' checked' : ''}${isEditor() ? '' : ' disabled'}>
    <button type="button" class="name-link" data-open="action:${a.id}">${esc(a.what)}</button>
    <span class="muted small">${a.owner ? esc(a.owner) : '<span class="warn">no owner</span>'} · ${a.due_date ? `<span class="${overdue ? 'warn' : ''}">${esc(fmtDate(a.due_date))}</span>` : '<span class="warn">no date</span>'}${withProject && (a.project_id || a.topic) ? ' · ' + esc(shortName(map.get(a.project_id)?.name || a.topic)) : ''}</span></div>`;
}
