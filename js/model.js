// Derived information: groups, current stages, deadlines, meetings, alerts.
import { state } from './store.js';
import { parseDate, isoDate, today, addDays, addMonths, daysBetween, fmtDate, byKey } from './util.js';

export const STAGES = ['Idea', 'Funding', 'Planning', 'Delivery', 'Wrap-up'];
export const STAGE_STYLE = {
  Idea: { bg: '#C9CFD4', fg: '#003B5C' },
  Funding: { bg: '#FFB81C', fg: '#003B5C' },
  Planning: { bg: '#8BB8E8', fg: '#003B5C' },
  Delivery: { bg: '#2774AE', fg: '#FFFFFF' },
  'Wrap-up': { bg: '#003B5C', fg: '#FFFFFF' },
  Ongoing: { bg: '#EFEDE5', fg: '#3F464B' }
};
export const PILLARS = { Education: '#2774AE', Research: '#003B5C', Clinical: '#8BB8E8', Community: '#FFB81C', Global: '#00AEC7' };
export const CATEGORIES = {
  active: { name: 'Active Projects', desc: 'Projects with stages and dates' },
  pipeline: { name: 'Pipeline', desc: 'Inquiries and new programs seeking funding' },
  standing: { name: 'Standing Programs', desc: 'Ongoing; confirmed dates appear on their rows' },
  archived: { name: 'Archived', desc: 'Inactive programs, hidden from the timeline' }
};
export const TYPES = ['Course', 'CME', 'Workshop', 'Lecture', 'Fellowship', 'Mentorship', 'Event', 'Conference', 'Grant', 'Study', 'Media', 'Partnership'];
export const AUDIENCES = ['Middle school', 'High school', 'Undergraduates', 'Medical students', 'Residents', 'Fellows', 'Physicians', 'Acupuncturists', 'Allied health', 'International scholars', 'Health administrators', 'General public'];
export const EVENT_TYPES = ['Conference', 'Workshop', 'Talk', 'Gathering'];
export const EVENT_GROUP = { Conference: 'Conferences', Workshop: 'Workshops', Talk: 'Talks & Lectures', Gathering: 'Gatherings & Community Events' };
export const GIFT_STAGES = ['Cultivating', 'Proposal', 'Pledged', 'Received', 'Stewardship', 'Closed'];
export const QUICK = ['No change', 'On track', 'Waiting', 'Blocked', 'Done'];

export const projectsById = () => byKey(state.data.projects);

// Ordered rows for one category: each parent followed by its children (any depth).
export function projectTree(category) {
  const list = state.data.projects.filter((p) => p.category === category);
  const ids = new Set(list.map((p) => p.id));
  const kids = new Map();
  for (const p of list) {
    const parent = p.parent_id && ids.has(p.parent_id) ? p.parent_id : null;
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(p);
  }
  const sort = (a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name);
  const out = [];
  const walk = (pid, depth) => {
    for (const p of (kids.get(pid) || []).sort(sort)) { out.push({ p, depth }); walk(p.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}

export function phasesOf(pid) {
  return state.data.phases.filter((r) => r.project_id === pid).sort((a, b) => a.start_date.localeCompare(b.start_date));
}
export function datesOf(pid) {
  return state.data.dates.filter((r) => r.project_id === pid).sort((a, b) => a.on_date.localeCompare(b.on_date));
}
export function eventsOf(pid) { return state.data.events.filter((e) => (e.project_ids || []).includes(pid)); }

export function currentStage(pid, on = today()) {
  const ph = phasesOf(pid).filter((r) => r.stage !== 'Ongoing');
  const cur = ph.filter((r) => parseDate(r.start_date) <= on && parseDate(r.end_date) >= on);
  if (cur.length) return cur[cur.length - 1].stage;
  const next = ph.find((r) => parseDate(r.start_date) > on);
  if (next) return next.stage;
  return ph.length ? ph[ph.length - 1].stage : null;
}

export function eventTags(e) {
  const map = projectsById();
  const tags = (e.project_ids || []).map((id) => map.get(id)?.name).filter(Boolean);
  if (e.host === 'Outside') tags.unshift('Outside');
  return tags.concat(e.extra_tags || []);
}

export function shortName(name) {
  return String(name).replace(/ Program$/, '').replace(/: Introduction to Integrative East-West Medicine$/, '');
}

// ---------------- Meetings ----------------
const STEP = { weekly: (d) => addDays(d, 7), biweekly: (d) => addDays(d, 14), monthly: (d) => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()), quarterly: (d) => new Date(d.getFullYear(), d.getMonth() + 3, d.getDate()) };

// Concrete meeting dates between from and to (inclusive), expanding repeating meetings.
export function meetingOccurrences(from, to) {
  const out = [];
  const singles = state.data.meetings.filter((m) => !m.repeats && m.meeting_date);
  const taken = new Set(singles.map((m) => `${m.kind}|${m.project_id || ''}|${m.meeting_date}`));
  for (const m of singles) {
    const d = parseDate(m.meeting_date);
    if (d >= from && d <= to && m.status !== 'cancelled') out.push({ date: d, meeting: m, series: false });
  }
  for (const m of state.data.meetings.filter((x) => x.repeats && x.meeting_date)) {
    const until = m.repeat_until ? parseDate(m.repeat_until) : to;
    for (let d = parseDate(m.meeting_date); d <= to && d <= until; d = STEP[m.repeats](d)) {
      if (d < from) continue;
      if (taken.has(`${m.kind}|${m.project_id || ''}|${isoDate(d)}`)) continue;
      out.push({ date: d, meeting: m, series: true });
    }
  }
  return out.sort((a, b) => a.date - b.date);
}

export function unscheduledMeetings() {
  return state.data.meetings.filter((m) => !m.meeting_date && m.status === 'scheduled');
}

export function lastClosedMeeting(kind = 'admin') {
  return state.data.meetings.filter((m) => m.kind === kind && m.status === 'closed')
    .sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || ''))[0] || null;
}

// ---------------- Deadlines and alerts ----------------
export function upcoming(days = 30, from = today()) {
  const to = addDays(from, days);
  const map = projectsById();
  const items = [];
  for (const d of state.data.dates) {
    const on = parseDate(d.on_date);
    if (d.done || on < from || on > to) continue;
    const ev = d.event_id ? state.data.events.find((e) => e.id === d.event_id) : null;
    items.push({ date: on, what: d.label + (d.tentative ? ' (to confirm)' : ''), who: ev ? ev.name : map.get(d.project_id)?.name || '', kind: d.kind });
  }
  // sub-items starting soon (e.g. the next ME-ME 207.01 student, a visiting rotator)
  for (const ph of state.data.phases) {
    const p = map.get(ph.project_id);
    if (!p || !p.parent_id || p.is_placeholder || p.category === 'archived') continue;
    const on = parseDate(ph.start_date);
    if (on < from || on > to) continue;
    items.push({ date: on, what: `${p.name} starts`, who: `${map.get(p.parent_id)?.name || ''}${ph.end_date ? ' · until ' + fmtDate(ph.end_date) : ''}`, kind: 'key' });
  }
  for (const e of state.data.events) {
    if (!e.start_date) continue;
    const on = parseDate(e.start_date);
    if (on < from || on > to) continue;
    items.push({ date: on, what: e.name + (e.tentative ? ' (to confirm)' : ''), who: eventTags(e).join(' · '), kind: 'event' });
  }
  for (const a of state.data.actions) {
    if (a.status !== 'open' || !a.due_date) continue;
    const on = parseDate(a.due_date);
    if (on < from || on > to) continue;
    items.push({ date: on, what: 'Action due: ' + a.what, who: [a.owner, map.get(a.project_id)?.name].filter(Boolean).join(' · '), kind: 'action' });
  }
  return items.sort((a, b) => a.date - b.date);
}

export function attention() {
  const t = today();
  const out = [];
  for (const p of state.data.projects) {
    if (p.category === 'archived') continue;
    if (p.flag) out.push({ what: p.name, detail: `is flagged "${p.flag}".`, pid: p.id, level: 2 });
  }
  for (const d of state.data.dates) {
    if (d.kind !== 'deadline' || d.done) continue;
    const n = daysBetween(t, parseDate(d.on_date));
    if (n < 0) out.push({ what: d.label, detail: `was due ${fmtDate(d.on_date)}. Mark done or set a new date.`, pid: d.project_id, level: 3 });
    else if (n <= 45) out.push({ what: d.label, detail: `due ${fmtDate(d.on_date)} (${n} days).`, pid: d.project_id, level: 1 });
  }
  const overdue = state.data.actions.filter((a) => a.status === 'open' && a.due_date && parseDate(a.due_date) < t).length;
  if (overdue) out.push({ what: `${overdue} action item${overdue > 1 ? 's' : ''}`, detail: 'are overdue.', level: 3, tab: 'actions' });
  const noOwner = state.data.actions.filter((a) => a.status === 'open' && (!a.owner || !a.due_date)).length;
  if (noOwner) out.push({ what: `${noOwner} action item${noOwner > 1 ? 's' : ''}`, detail: 'have no owner or due date.', level: 1, tab: 'actions' });
  const missingLead = state.data.projects.filter((p) => p.category !== 'archived' && !p.is_placeholder && /\[|^$/.test(p.leads || '')).map((p) => shortName(p.name));
  if (missingLead.length) out.push({ what: 'Leads to confirm:', detail: missingLead.join(', ') + '.', level: 1 });
  const placeholders = state.data.projects.filter((p) => p.is_placeholder && /confirm/i.test(p.leads || '')).length;
  if (placeholders) out.push({ what: `${placeholders} placeholder item${placeholders > 1 ? 's' : ''}`, detail: 'still need confirming.', level: 1 });
  const missingImpact = state.data.impact.filter((i) => i.status === 'Missing').length;
  if (missingImpact) out.push({ what: `${missingImpact} impact number${missingImpact > 1 ? 's' : ''}`, detail: 'are missing.', level: 0, tab: 'impact' });
  const noAttendance = state.data.events.filter((e) => e.host === 'CEWM' && e.start_date && parseDate(e.end_date || e.start_date) < t && e.attendance == null).length;
  if (noAttendance) out.push({ what: `${noAttendance} past event${noAttendance > 1 ? 's' : ''}`, detail: 'have no attendance entered.', level: 0, tab: 'events' });
  return out.sort((a, b) => b.level - a.level);
}

// Next date of a repeating admin meeting on or after a day.
export function nextAdminMeeting(from = today()) {
  const occ = meetingOccurrences(addDays(from, -1), addDays(from, 60)).filter((o) => o.meeting.kind === 'admin' && o.date >= addDays(from, 0));
  return occ[0] || null;
}

export function fiscalStart(d = today()) {
  return new Date(d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, 6, 1);
}
export function rangeStart(range, base = today()) {
  if (range === 'fiscal') return fiscalStart(base);
  if (range === 'cal-this') return new Date(base.getFullYear(), 0, 1);
  if (range === 'cal-next') return new Date(base.getFullYear() + 1, 0, 1);
  if (range === 'fiscal-next') return addMonths(fiscalStart(base), 12);
  return fiscalStart(base);
}
