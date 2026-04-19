/**
 * dashboard.js
 * VenuSphere Home — Live Event Hero, Crowd Autopilot™ status,
 * proactive prediction cards, quick actions, and impact metrics.
 */

import { subscribeToDoc, subscribeToCollection } from '../services/firebase-client.js';
import { getAlerts, getCrowdData } from '../services/api-client.js';
import { onPrediction, getPredictions, getImpactMetrics } from '../services/autopilot-engine.js';
import { announce, showToast } from '../utils/a11y.js';
import { t } from '../utils/i18n.js';

let _root = null;
let _unsubs = [];
let _phase = 'pre_event';
let _autopilotUnsub = null;

const DEMO_CROWD = [
  { zone_id: 'gate_north',    density: 0.75, label: 'high',     trend: 'increasing' },
  { zone_id: 'food_court_a',  density: 0.40, label: 'moderate', trend: 'stable' },
  { zone_id: 'stand_north',   density: 0.30, label: 'low',      trend: 'stable' },
  { zone_id: 'main_concourse',density: 0.50, label: 'moderate', trend: 'increasing' },
];

const DEMO_ALERTS = [
  { priority: 'high',   title: 'Halftime Rush in 8 min', message: 'Food Court A surge incoming. Head to Food Court B — only 2 min wait right now.' },
  { priority: 'medium', title: 'Autopilot Tip',           message: 'Gate D is 9 min faster than Gate B right now. Switch route for faster exit.' },
];

export function mount(rootId) {
  _root = document.getElementById(rootId);
  if (!_root) return;
  _render();
  _subscribeToLiveData();
  _startAutopilotWidget();
  _fetchAndRender();
}

export function refresh() {
  _fetchAndRender();
  _startAutopilotWidget();
}

function _render() {
  _root.innerHTML = `
    <div class="dashboard-wrap">

      ${_liveEventHero()}

      <!-- Autopilot Status Banner -->
      <div class="autopilot-section mb-6">
        <div class="section-header mb-3">
          <div style="display:flex;align-items:center;gap:var(--sp-2)">
            <h2 class="section-title">Crowd Autopilot™</h2>
            <span class="autopilot-badge">Active</span>
          </div>
          <span id="pred-count" style="font-size:var(--text-xs);color:var(--clr-text-muted)">scanning…</span>
        </div>
        <div id="prediction-feed" style="display:flex;flex-direction:column;gap:var(--sp-2)">
          ${_skeletonPredictions()}
        </div>
      </div>

      <!-- Quick Actions -->
      <section aria-label="Quick actions" class="mb-6">
        <h2 class="section-title mb-3">${t('dashboard.quickActions') || 'Quick Actions'}</h2>
        <div class="quick-actions">
          <button class="quick-action-btn card" id="qa-food" aria-label="Find food with shortest queue">
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

      <!-- Zone Density -->
      <section aria-label="Crowd overview" class="mb-6">
        <h2 class="section-title mb-3">Zone Density</h2>
        <div class="card" style="padding:0">
          <div id="zone-density-list" role="list" aria-label="Zone crowd levels">
            ${_renderZoneList(DEMO_CROWD)}
          </div>
        </div>
      </section>

      <!-- Live Updates -->
      <section aria-label="Live alerts" class="mb-6">
        <div class="section-header mb-3">
          <h2 class="section-title">Live Updates</h2>
          <span id="alert-count" class="phase-badge" aria-label="Alert count">${DEMO_ALERTS.length} new</span>
        </div>
        <div id="alert-list" role="list" aria-label="Smart alerts" style="display:flex;flex-direction:column;gap:var(--sp-2)">
          ${DEMO_ALERTS.map(_renderAlert).join('')}
        </div>
      </section>

      <!-- Impact Metrics -->
      <section aria-label="Autopilot impact metrics" class="mb-6">
        <h2 class="section-title mb-3">Today's Impact</h2>
        <div class="impact-grid" id="impact-grid">
          ${_renderImpactGrid()}
        </div>
      </section>

    </div>`;

  _bindQuickActions();
}

function _liveEventHero() {
  return `
  <div class="hero-card mb-6">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:2">
      <div>
        <div style="display:flex;align-items:center;gap:var(--sp-2);color:#fff;font-weight:var(--fw-semi);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:0.06em">
          <span style="width:8px;height:8px;background:var(--clr-success);border-radius:50%;box-shadow:0 0 8px var(--clr-success);display:inline-block;animation:pulse-dot 2s infinite"></span>
          Live Event
        </div>
        <h1 style="margin-top:var(--sp-2);color:#fff;font-size:2rem;font-weight:var(--fw-black);line-height:1.1;letter-spacing:-0.03em">Eden Gardens</h1>
        <div style="font-size:var(--text-sm);color:rgba(255,255,255,0.75);margin-top:var(--sp-1)">Championship Final 2026 · 43,200 in attendance</div>
      </div>
      <div id="hero-phase-badge" class="phase-badge" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);color:#fff">
        ${_phaseLabel(_phase)}
      </div>
    </div>
  </div>`;
}

function _skeletonPredictions() {
  return [1,2].map(() =>
    `<div class="prediction-card" style="height:60px;background:var(--clr-surface-2);animation:pulse-dot 2s infinite"></div>`
  ).join('');
}

function _renderPredictions(predictions) {
  if (!predictions.length) {
    return `<div class="prediction-card severity-info">
      <div style="font-size:1.25rem">✅</div>
      <div>
        <div style="font-weight:var(--fw-semi);font-size:var(--text-sm)">All zones clear</div>
        <div style="font-size:var(--text-xs);color:var(--clr-text-muted)">No surges predicted. Enjoy the match!</div>
      </div>
    </div>`;
  }

  const typeLabels = {
    surge_warning: 'SURGE ALERT',
    queue_alert: 'QUEUE ALERT',
    opportunity: 'OPPORTUNITY',
    timing: 'SMART TIP',
  };

  return predictions.slice(0, 3).map((p, i) => {
    const icon = p.icon || '💡';
    const typeLabel = typeLabels[p.type] || 'INSIGHT';
    const severityColor = { critical: 'var(--clr-danger)', warning: 'var(--clr-warning)', info: 'var(--clr-primary)' }[p.severity] || 'var(--clr-text-muted)';

    const altLine = p.alternateZone
      ? `<div style="font-size:var(--text-xs);color:var(--clr-success);margin-top:3px;font-weight:var(--fw-medium)">→ Try <strong>${_esc(p.alternateZone)}</strong></div>`
      : '';
    const savingsBadge = p.savingsMinutes
      ? `<span style="font-size:var(--text-xs);font-weight:var(--fw-bold);color:#000;background:var(--clr-success);padding:3px 10px;border-radius:999px;white-space:nowrap;flex-shrink:0">Save ${p.savingsMinutes}m</span>`
      : '';

    return `<div class="prediction-card severity-${p.severity}" role="listitem" style="animation-delay:${i * 80}ms">
      <div style="font-size:1.5rem;flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:var(--radius-md)">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.6rem;font-weight:var(--fw-bold);color:${severityColor};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">${typeLabel}</div>
        <div style="font-size:var(--text-sm);font-weight:var(--fw-semi);color:var(--clr-text);line-height:var(--lh-tight)">${_esc(p.message)}</div>
        ${altLine}
      </div>
      ${savingsBadge}
    </div>`;
  }).join('');
}

function _renderImpactGrid() {
  const m = getImpactMetrics();
  return `
    <div class="impact-card">
      <div class="impact-value">-${m.queueReduction}%</div>
      <div class="impact-label">Queue Time</div>
    </div>
    <div class="impact-card">
      <div class="impact-value">-${m.congestionReduction}%</div>
      <div class="impact-label">Congestion</div>
    </div>
    <div class="impact-card">
      <div class="impact-value">-${m.exitSpeedup}%</div>
      <div class="impact-label">Exit Time</div>
    </div>`;
}

function _renderZoneList(zones) {
  return zones.slice(0, 6).map(z => `
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

function _startAutopilotWidget() {
  if (_autopilotUnsub) _autopilotUnsub();
  _autopilotUnsub = onPrediction((predictions) => {
    const feed = document.getElementById('prediction-feed');
    const count = document.getElementById('pred-count');
    if (feed) feed.innerHTML = _renderPredictions(predictions);
    if (count) count.textContent = `${predictions.length} prediction${predictions.length !== 1 ? 's' : ''}`;
  });

  // Render current predictions immediately
  const current = getPredictions();
  const feed = document.getElementById('prediction-feed');
  if (feed && current.length) feed.innerHTML = _renderPredictions(current);
}

async function _fetchAndRender() {
  try {
    const [crowdResp, alertResp] = await Promise.all([getCrowdData(), getAlerts()]);
    const crowdData = crowdResp.zones?.length ? crowdResp.zones : DEMO_CROWD;
    const alertData = alertResp.alerts?.length ? alertResp.alerts : DEMO_ALERTS;
    _phase = crowdResp.phase || 'pre_event';

    const zoneEl = document.getElementById('zone-density-list');
    if (zoneEl) zoneEl.innerHTML = _renderZoneList(crowdData);

    const alertEl = document.getElementById('alert-list');
    if (alertEl) alertEl.innerHTML = alertData.map(_renderAlert).join('');

    const countEl = document.getElementById('alert-count');
    if (countEl) countEl.textContent = `${alertData.length} new`;

    const phaseBadge = document.getElementById('hero-phase-badge');
    if (phaseBadge) phaseBadge.textContent = _phaseLabel(_phase);

    const impactEl = document.getElementById('impact-grid');
    if (impactEl) impactEl.innerHTML = _renderImpactGrid();
  } catch { /* keep demo data */ }
}

function _subscribeToLiveData() {
  const unsub = subscribeToDoc('crowd_summary', 'live', (data) => {
    if (!data) return;
    if (data.current_phase) _phase = data.current_phase;
    const badge = document.getElementById('hero-phase-badge');
    if (badge) badge.textContent = _phaseLabel(_phase);
  });
  _unsubs.push(unsub);
}

function _bindQuickActions() {
  document.getElementById('qa-food')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('vf:navigate', { detail: { view: 'queue', filter: 'food' } }));
  });
  document.getElementById('qa-restroom')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('vf:navigate', { detail: { view: 'queue', filter: 'restroom' } }));
  });
  document.getElementById('qa-exit')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('vf:navigate', { detail: { view: 'assistant', prompt: 'Which gate has the shortest exit queue right now?' } }));
  });
}

function _phaseLabel(phase) {
  return { pre_event: 'Pre-Event', first_half: '1st Half', halftime: 'Half Time', second_half: '2nd Half', post_event: 'Post-Event' }[phase] || 'Live';
}

function _formatZoneId(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
