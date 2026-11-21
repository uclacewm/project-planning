// Excel export, calendar (.ics) download for Outlook, and .ics import.
import { state, save, isEditor } from './store.js';
import { esc, parseDate, isoDate, today, addDays, fmtDate } from './util.js';
import { projectsById, currentStage, eventTags, meetingOccurrences } from './model.js';
import { openForm, toast } from './forms.js';

// ---------------- Excel ----------------
export async function exportExcel() {
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const map = projectsById();
  const name = (id) => map.get(id)?.name || '';
  const wb = XLSX.utils.book_new();
  const add = (title, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'No rows' }]), title);
  const GROUP = { active: 'Active', pipeline: 'Pipeline', standing: 'Standing', archived: 'Archived' };
  add('Projects', state.data.projects.filter((p) => !p.is_placeholder).sort((a, b) => a.sort_order - b.sort_order).map((p) => ({
    Project: p.name, Group: GROUP[p.category], 'Part of': name(p.parent_id), Lead: p.leads || '', 'Current stage': currentStage(p.id) || '',
    Pillar: p.pillar || '', 'Other pillars': (p.other_pillars || []).join(', '), Type: (p.types || []).join(', '), Audiences: (p.audiences || []).join(', '),
    Flag: p.flag || '', 'Seeking support': p.seeking_support ? 'Yes' : '', Description: p.public_description || '', 'Team notes': p.team_notes || '',
    'Box folder': p.box_url || '', Qualtrics: p.qualtrics_url || '', 'Last changed by': p.updated_by || '', 'Last changed': p.updated_at ? p.updated_at.slice(0, 10) : ''
  })));
  add('Timeline', state.data.phases.map((r) => ({ Project: name(r.project_id), Stage: r.stage, Label: r.label || '', Start: r.start_date, End: r.end_date })).sort((a, b) => a.Project.localeCompare(b.Project)));
  add('Key dates', state.data.dates.map((d) => ({ Date: d.on_date, What: d.label, Kind: d.kind, Project: name(d.project_id), Event: state.data.events.find((e) => e.id === d.event_id)?.name || '', 'To confirm': d.tentative ? 'Yes' : '', Done: d.done ? 'Yes' : '' })).sort((a, b) => a.Date.localeCompare(b.Date)));
  add('Events', state.data.events.map((e) => ({ Event: e.name, Type: e.event_type, Host: e.host, Start: e.start_date || '', End: e.end_date || '', Time: e.start_time || '', 'Date note': e.when_text || '', Location: e.location || '', Tags: eventTags(e).join(', '), Lead: e.lead || '', 'To confirm': e.tentative ? 'Yes' : '', Attendance: e.attendance ?? '' })).sort((a, b) => (a.Start || '9').localeCompare(b.Start || '9')));
  add('Action items', state.data.actions.map((a) => ({ Action: a.what, Owner: a.owner || '', Due: a.due_date || '', Status: a.status, Project: name(a.project_id) || a.topic || '', 'Done on': a.done_at ? a.done_at.slice(0, 10) : '' })).sort((a, b) => (a.Due || '9').localeCompare(b.Due || '9')));
  add('Impact', state.data.impact.map((r) => ({ Project: name(r.project_id), Tier: r.tier, Number: r.count ?? '', Status: r.status, Source: r.source || '', 'As of': r.as_of || '', Note: r.note || '' })));
  add('Meetings', state.data.meetings.map((m) => ({ Meeting: m.title, Kind: m.kind, Project: name(m.project_id), Date: m.meeting_date || '', Repeats: m.repeats || '', Time: [m.start_time, m.end_time].filter(Boolean).join('–'), Location: m.location || '', Status: m.status })));
  if (isEditor() && state.data.gifts.length) add('Fundraising', state.data.gifts.map((g) => ({ Donor: g.donor, Stage: g.stage, Amount: g.amount_text || '', Project: name(g.project_id), Owner: g.owner || '', 'Next step': g.next_step || '', 'Next date': g.next_date || '', Description: g.description || '' })));
  XLSX.writeFile(wb, `CEWM Project Planning ${isoDate(today())}.xlsx`);
}

// ---------------- .ics download ----------------
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
const icsDate = (d) => isoDate(d).replace(/-/g, '');
function fold(line) { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); }

function parseTime(t) {
  const m = String(t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/i);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] || 0); const ap = (m[3] || '').toLowerCase();
  if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0;
  if (!ap && h < 7) h += 12;
  return `${String(h).padStart(2, '0')}${String(min).padStart(2, '0')}00`;
}

export function exportIcs() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UCLA CEWM//Project Planning//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:CEWM Project Planning',
    'BEGIN:VTIMEZONE', 'TZID:America/Los_Angeles', 'BEGIN:STANDARD', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'END:DAYLIGHT', 'END:VTIMEZONE'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev = (uid, day, endDay, summary, desc, loc, time, endTime, rrule) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@cewm-planning`, `DTSTAMP:${stamp}`);
    const st = parseTime(time), et = parseTime(endTime);
    if (st) { lines.push(`DTSTART;TZID=America/Los_Angeles:${icsDate(day)}T${st}`, `DTEND;TZID=America/Los_Angeles:${icsDate(day)}T${et || String(Number(st.slice(0, 2)) + 1).padStart(2, '0') + st.slice(2)}`); }
    else { lines.push(`DTSTART;VALUE=DATE:${icsDate(day)}`, `DTEND;VALUE=DATE:${icsDate(addDays(endDay || day, 1))}`); }
    if (rrule) lines.push(rrule);
    lines.push(fold(`SUMMARY:${icsText(summary)}`));
    if (desc) lines.push(fold(`DESCRIPTION:${icsText(desc)}`));
    if (loc) lines.push(fold(`LOCATION:${icsText(loc)}`));
    lines.push('END:VEVENT');
  };
  for (const e of state.data.events) if (e.start_date) ev(e.id, parseDate(e.start_date), parseDate(e.end_date || e.start_date), e.name + (e.tentative ? ' (to confirm)' : ''), eventTags(e).join(', '), e.location, (e.start_time || '').split('-')[0], (e.start_time || '').split('-')[1]);
  const RR = { weekly: 'RRULE:FREQ=WEEKLY', biweekly: 'RRULE:FREQ=WEEKLY;INTERVAL=2', monthly: 'RRULE:FREQ=MONTHLY', quarterly: 'RRULE:FREQ=MONTHLY;INTERVAL=3' };
  for (const m of state.data.meetings) {
    if (!m.meeting_date || m.status === 'cancelled') continue;
    if (!m.repeats && m.status === 'closed') continue;
    const rr = m.repeats ? RR[m.repeats] + (m.repeat_until ? `;UNTIL=${icsDate(parseDate(m.repeat_until))}` : '') : null;
    ev(m.id, parseDate(m.meeting_date), null, m.title, '', m.location, m.start_time, m.end_time, rr);
  }
  const map = projectsById();
  for (const d of state.data.dates) if (d.kind === 'deadline' && !d.done) ev(d.id, parseDate(d.on_date), null, `Deadline: ${d.label}`, map.get(d.project_id)?.name || state.data.events.find((e) => e.id === d.event_id)?.name || '', null);
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'CEWM Project Planning.ics'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Downloaded. Open the file to add these to Outlook.');
}

// ---------------- .ics import ----------------
function parseIcs(text) {
  const raw = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null;
  for (const line of raw) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; }
    else if (cur) { const i = line.indexOf(':'); if (i < 0) continue; const [k] = line.slice(0, i).split(';'); cur[k.toUpperCase()] = line.slice(i + 1).replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1'); }
  }
  return out.map((v) => {
    const ds = v.DTSTART || ''; const de = v.DTEND || '';
    const date = ds.length >= 8 ? `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}` : null;
    const time = (s) => { if (s.length < 15) return null; let h = Number(s.slice(9, 11)); const m = s.slice(11, 13); if (s.endsWith('Z')) { const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), h, +m)); h = d.getHours(); } const ap = h >= 12 ? 'pm' : 'am'; return `${h % 12 || 12}:${m} ${ap}`; };
    const rr = v.RRULE || '';
    let repeats = null;
    if (/FREQ=WEEKLY/.test(rr)) repeats = /INTERVAL=2/.test(rr) ? 'biweekly' : 'weekly';
    else if (/FREQ=MONTHLY/.test(rr)) repeats = /INTERVAL=3/.test(rr) ? 'quarterly' : 'monthly';
    const until = (rr.match(/UNTIL=(\d{8})/) || [])[1];
    return { title: v.SUMMARY || 'Meeting', meeting_date: date, start_time: time(ds), end_time: time(de), location: v.LOCATION || null, repeats, repeat_until: until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null };
  }).filter((m) => m.meeting_date);
}

export function importIcs() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.ics,text/calendar';
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    const items = parseIcs(await file.text());
    if (!items.length) { toast('No meetings found in that file.', 'error'); return; }
    const isAdmin = (t) => /admin/i.test(t);
    const html = `<p>${items.length} item${items.length > 1 ? 's' : ''} found. Uncheck any you don't want.</p><ul class="import-list">${items.map((m, i) => `<li><label class="check"><input type="checkbox" data-imp="${i}" checked> <b>${esc(m.title)}</b> · ${esc(fmtDate(m.meeting_date, true))}${m.start_time ? ', ' + esc(m.start_time) : ''}${m.repeats ? ` · repeats ${esc(m.repeats)}` : ''}${m.location ? ' · ' + esc(m.location) : ''}</label></li>`).join('')}</ul>`;
    const d = openForm({
      title: 'Import meetings', fields: [], extraHtml: html, saveLabel: 'Import selected',
      onSave: async () => {
        const chosen = [...d.querySelectorAll('[data-imp]:checked')].map((c) => items[Number(c.dataset.imp)]);
        for (const m of chosen) await save('meetings', { ...m, kind: isAdmin(m.title) ? 'admin' : 'project', status: 'scheduled' });
      }
    });
  });
  input.click();
}
