/**
 * schedule.js
 * Event timeline, phase display, smart alerts, and announcement feed.
 */

import { getSchedule } from '../services/api-client.js';
import { subscribeToCollection } from '../services/firebase-client.js';
import { announce } from '../utils/a11y.js';

let _root = null;
let _unsub = null;

const DEMO_SCHEDULE = {
  name: 'Championship Final 2026',
  current_phase: 'pre_event',
  phases: [
    { id: 'pre_event',   name: 'Pre-Event',    duration_minutes: 90, start_offset: -90, desc: 'Gates open, fan zones active' },
    { id: 'first_half',  name: '1st Half',     duration_minutes: 45, start_offset: 0,   desc: 'Match underway — stay in stands' },
    { id: 'halftime',    name: 'Half Time',    duration_minutes: 20, start_offset: 45,  desc: 'Concessions surge — plan ahead!' },
    { id: 'second_half', name: '2nd Half',     duration_minutes: 45, start_offset: 65,  desc: 'Return to your seat' },
    { id: 'post_event',  name: 'Post-Event',   duration_minutes: 60, start_offset: 110, desc: 'Staggered exit — use VenueFlow nav' },
  ],
};

const DEMO_ALERTS = [
  { priority: 'high',   title: 'Halftime in 10 min', message: 'Lines will spike. Head to Food Court B now — only 5-min wait currently.' },
  { priority: 'medium', title: 'Best Restroom',       message: 'Restroom West has shortest wait at 3 min vs 15 min at North.' },
  { priority: 'low',    title: 'Merchandise',         message: 'Merch shop has low crowd now — best time to browse!' },
];

/**
 * Mount the schedule view.
 * @param {string} rootId
 */
export function mount(rootId) {
  _root = document.getElementById(rootId);
  if (!_root) return;
  _render(DEMO_SCHEDULE, DEMO_ALERTS);
  _fetchSchedule();
  _subscribeToAnnouncements();
}

export function refresh() {
  _fetchSchedule();
}

function _render(schedule, alerts) {
  const currentIdx = schedule.phases.findIndex((p) => p.id === schedule.current_phase);
  _root.innerHTML = `
    <div>
      <div class="section-header mb-4">
        <h1 class="section-title">Event Schedule</h1>
        <span class="live-dot">Live</span>
      </div>

      <div class="card mb-6" style="background:linear-gradient(135deg,rgba(67,97,238,0.15),rgba(114,9,183,0.15));border-color:rgba(67,97,238,0.3)">
        <div style="font-size:0.7rem;color:var(--clr-text-faint);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.25rem">Now Playing</div>
        <div style="font-size:1.125rem;font-weight:700">${_esc(schedule.name)}</div>
        <div style="font-size:0.8rem;color:var(--clr-success);margin-top:0.25rem;font-weight:600">
          ${_esc(schedule.phases[currentIdx]?.name || 'Pre-Event')} — currently active
        </div>
      </div>

      <section aria-label="Event timeline" class="mb-6">
        <h2 class="section-title mb-4">Timeline</h2>
        <div class="timeline" role="list">
          ${schedule.phases.map((phase, i) => {
            const status = i < currentIdx ? 'completed' : i === currentIdx ? 'active' : '';
            return `<div class="timeline-item ${status}" role="listitem" aria-label="${phase.name}: ${status || 'upcoming'}">
              <div class="timeline-dot" aria-hidden="true"></div>
              <div class="timeline-time">${_phaseTime(phase)}</div>
              <div class="timeline-name">${_esc(phase.name)}</div>
              <div class="timeline-desc">${_esc(phase.desc || '')}</div>
              ${status === 'active' ? `<span style="display:inline-block;margin-top:0.25rem;font-size:0.7rem;background:rgba(67,97,238,0.2);color:var(--clr-primary);border-radius:9999px;padding:1px 8px;font-weight:600">● NOW</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </section>

      <section aria-label="Smart alerts" class="mb-6">
        <div class="section-header mb-3">
          <h2 class="section-title">Smart Alerts</h2>
          <span class="phase-badge">${alerts.length} active</span>
        </div>
        <div id="alerts-list" role="list">
          ${alerts.map(_renderAlert).join('')}
        </div>
      </section>

      <section aria-label="Announcements" class="mb-4">
        <h2 class="section-title mb-3">Announcements</h2>
        <div id="announcements-list" role="log" aria-live="polite">
          <p style="color:var(--clr-text-muted);font-size:0.875rem">Listening for venue announcements…</p>
        </div>
      </section>
    </div>`;
}

function _renderAlert(a) {
  const icons = { high: '🔴', medium: '🟡', low: '🟢' };
  return `<div class="alert-item ${a.priority}" role="listitem" style="margin-bottom:0.5rem">
    <div class="alert-item-icon">${icons[a.priority] || '📢'}</div>
    <div class="alert-item-body">
      <div class="alert-item-title">${_esc(a.title)}</div>
      <div class="alert-item-msg">${_esc(a.message)}</div>
    </div>
  </div>`;
}

async function _fetchSchedule() {
  try {
    const resp = await getSchedule();
    _render(
      { ...DEMO_SCHEDULE, ...resp.schedule, current_phase: resp.current_phase || DEMO_SCHEDULE.current_phase },
      resp.alerts?.length ? resp.alerts : DEMO_ALERTS
    );
  } catch { /* keep demo */ }
}

function _subscribeToAnnouncements() {
  if (_unsub) _unsub();
  _unsub = subscribeToCollection(
    'announcements',
    (items) => {
      const el = document.getElementById('announcements-list');
      if (!el || !items.length) return;
      el.innerHTML = items.slice(0, 5).map((a) => `
        <div class="${a.priority === 'emergency' ? 'alert-item high' : 'alert-item'}" role="listitem" style="margin-bottom:0.5rem">
          <div class="alert-item-body">
            <div class="alert-item-title">${a.priority === 'emergency' ? '🚨 Emergency' : '📢 Announcement'}</div>
            <div class="alert-item-msg">${_esc(a.message)}</div>
          </div>
        </div>`).join('');
      announce(`New announcement: ${items[0].message.substring(0, 60)}`);
    },
    { orderByField: 'created_at', limitTo: 5 }
  );
}

function _phaseTime(phase) {
  const offsets = { pre_event: 'Gates Open', first_half: 'Kickoff', halftime: '+45 min', second_half: '+65 min', post_event: '+110 min' };
  return offsets[phase.id] || '';
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
