/**
 * dashboard.js
 * Main dashboard: live venue overview, quick actions, alert list, capacity ring.
 */

import { subscribeToDoc, subscribeToCollection } from '../services/firebase-client.js';
import { getAlerts, getCrowdData } from '../services/api-client.js';
import { announce, showToast } from '../utils/a11y.js';
import { t } from '../utils/i18n.js';

let _root = null;
let _unsubs = [];
let _crowdData = [];
let _alertData = [];
let _phase = 'pre_event';

/** Demo fallback data used when API is not yet configured. */
const DEMO_CROWD = [
  { zone_id: 'gate_north', density: 0.75, label: 'high', trend: 'stable' },
  { zone_id: 'food_court_a', density: 0.40, label: 'moderate', trend: 'stable' },
  { zone_id: 'stand_north', density: 0.30, label: 'low', trend: 'stable' },
  { zone_id: 'main_concourse', density: 0.50, label: 'moderate', trend: 'increasing' },
];
const DEMO_ALERTS = [
  { priority: 'high', title: 'Gates Now Open', message: 'Gate East is least crowded for quickest entry.', type: 'info' },
  { priority: 'medium', title: 'Pre-Match Tip', message: 'Head to Food Court B now — only a 5-min wait before the rush.', type: 'warning' },
];

/**
 * Mount the dashboard into the given container element.
 * @param {string} rootId - Container element ID.
 */
export function mount(rootId) {
  _root = document.getElementById(rootId);
  if (!_root) return;
  _render();
  _subscribeToLiveData();
}

/** Refresh data when navigating back to the dashboard. */
export function refresh() {
  _fetchAndRender();
}

function _render() {
  _root.innerHTML = `
    <div class="dashboard-wrap">
      ${_liveEventHero()}

      <section aria-label="Quick actions" class="mb-6">
        <h2 class="section-title mb-3">${t('dashboard.quickActions') || 'Quick Actions'}</h2>
        <div class="quick-actions">
          <button class="quick-action-btn card" id="qa-food" aria-label="Find food with short queue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l17-9-9 17-2-8-6-1z"/></svg>
            Find Food
          </button>
          <button class="quick-action-btn card" id="qa-restroom" aria-label="Find nearest restroom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            Restroom
          </button>
          <button class="quick-action-btn card" id="qa-exit" aria-label="Navigate to least crowded exit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
            Best Exit
          </button>
        </div>
      </section>

      <section aria-label="Active alerts" class="mb-6">
        <div class="section-header mb-3">
          <h2 class="section-title">Live Updates</h2>
          <span id="alert-count" class="phase-badge" aria-label="Alert count">${DEMO_ALERTS.length} new</span>
        </div>
        <div id="alert-list" role="list" aria-label="Smart alerts" style="display:flex; flex-direction:column; gap:var(--sp-2)">
          ${DEMO_ALERTS.map(_renderAlert).join('')}
        </div>
      </section>
      
      <section aria-label="Crowd overview" class="mb-6">
        <h2 class="section-title mb-3">Zone Density</h2>
        <div class="card" style="padding:0">
          <div id="zone-density-list" role="list" aria-label="Zone crowd levels">
            ${_renderZoneList(DEMO_CROWD)}
          </div>
        </div>
      </section>
    </div>`;

  _bindQuickActions();
  _fetchAndRender();
}

function _liveEventHero() {
  return `
  <div class="hero-card mb-6">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; position:relative; z-index:2">
      <div>
        <div class="hero-subtitle" style="display:flex; align-items:center; gap:var(--sp-2); color:#fff; font-weight:var(--fw-semi)">
          <span class="live-dot" style="width:8px; height:8px; background:var(--clr-success); border-radius:50%; box-shadow:0 0 8px var(--clr-success); display:inline-block; animation:pulse-dot 2s infinite"></span>
          LIVE EVENT
        </div>
        <h1 class="hero-title" style="margin-top:var(--sp-2); color:#fff; font-size:2rem; line-height:1.1">Olympic Stadium</h1>
        <div style="font-size:var(--text-sm); color:rgba(255,255,255,0.8); margin-top:var(--sp-1)">Championship Final 2026</div>
      </div>
      <div id="hero-phase-badge" class="phase-badge" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:4px 8px">
        ${_phase.replace('_', ' ').toUpperCase()}
      </div>
    </div>
  </div>`;
}

function _renderZoneList(zones) {
  return zones.slice(0, 6).map((z) => `
    <div class="zone-list-item" role="listitem">
      <span>${_formatZoneId(z.zone_id)}</span>
      <span style="display:flex;align-items:center;gap:0.5rem">
        <span class="density-dot density-${z.label}" aria-hidden="true"></span>
        <span style="font-size:0.75rem;color:var(--clr-text-muted)">${Math.round(z.density * 100)}%</span>
        <span class="trend-arrow trend-${z.trend}" aria-label="Trend: ${z.trend}">
          ${z.trend === 'increasing' ? '↑' : z.trend === 'decreasing' ? '↓' : '→'}
        </span>
      </span>
    </div>`).join('');
}

function _renderAlert(a) {
  return `<div class="alert-item ${a.priority}" role="listitem">
    <div class="alert-item-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div class="alert-item-body">
      <div class="alert-item-title">${_esc(a.title)}</div>
      <div class="alert-item-msg">${_esc(a.message)}</div>
    </div>
  </div>`;
}

async function _fetchAndRender() {
  try {
    const [crowdResp, alertResp] = await Promise.all([getCrowdData(), getAlerts()]);
    _crowdData = crowdResp.zones || DEMO_CROWD;
    _alertData = alertResp.alerts || DEMO_ALERTS;
    _phase = crowdResp.phase || 'pre_event';

    const zoneEl = document.getElementById('zone-density-list');
    if (zoneEl) zoneEl.innerHTML = _renderZoneList(_crowdData);

    const alertEl = document.getElementById('alert-list');
    if (alertEl) alertEl.innerHTML = _alertData.map(_renderAlert).join('');

    const countEl = document.getElementById('alert-count');
    if (countEl) countEl.textContent = `${_alertData.length} active`;
  } catch {
    // Demo mode — keep default content shown
  }
}

function _subscribeToLiveData() {
  const unsub = subscribeToDoc('crowd_summary', 'live', (data) => {
    if (!data) return;
    const phaseBadge = document.getElementById('phase-badge');
    if (phaseBadge && data.current_phase) {
      _phase = data.current_phase;
    }
  });
  _unsubs.push(unsub);
}

function _bindQuickActions() {
  document.getElementById('qa-food')?.addEventListener('click', () => {
    window.location.hash = 'queue';
    window.dispatchEvent(new CustomEvent('vf:navigate', { detail: { view: 'queue', filter: 'food' } }));
  });
  document.getElementById('qa-restroom')?.addEventListener('click', () => {
    window.location.hash = 'queue';
    window.dispatchEvent(new CustomEvent('vf:navigate', { detail: { view: 'queue', filter: 'restroom' } }));
  });
  document.getElementById('qa-exit')?.addEventListener('click', () => {
    window.location.hash = 'assistant';
    window.dispatchEvent(new CustomEvent('vf:navigate', { detail: { view: 'assistant', prompt: 'Which gate has the shortest exit queue right now?' } }));
  });
}

function _formatZoneId(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
