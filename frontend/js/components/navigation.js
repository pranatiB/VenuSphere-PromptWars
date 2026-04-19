/**
 * navigation.js
 * Crowd-aware zone-to-zone navigation with Google Maps and step-by-step directions.
 */

import { getRoute } from '../services/api-client.js';
import { loadGoogleMaps, initMap, renderRoute, clearRoute } from '../services/maps-client.js';
import { announce, showToast } from '../utils/a11y.js';

let _root = null;
let _map = null;
let _mounted = false;

const ZONES = [
  { id: 'gate_north',    name: 'Gate North',     coords: { lat: 51.5600, lng: -0.2795 } },
  { id: 'gate_south',    name: 'Gate South',     coords: { lat: 51.5520, lng: -0.2795 } },
  { id: 'gate_east',     name: 'Gate East',      coords: { lat: 51.5560, lng: -0.2740 } },
  { id: 'gate_west',     name: 'Gate West',      coords: { lat: 51.5560, lng: -0.2850 } },
  { id: 'stand_north',   name: 'North Stand',    coords: { lat: 51.5585, lng: -0.2795 } },
  { id: 'stand_south',   name: 'South Stand',    coords: { lat: 51.5535, lng: -0.2795 } },
  { id: 'stand_east',    name: 'East Stand',     coords: { lat: 51.5560, lng: -0.2755 } },
  { id: 'stand_west',    name: 'West Stand',     coords: { lat: 51.5560, lng: -0.2835 } },
  { id: 'food_court_a',  name: 'Food Court A',   coords: { lat: 51.5572, lng: -0.2810 } },
  { id: 'food_court_b',  name: 'Food Court B',   coords: { lat: 51.5548, lng: -0.2780 } },
  { id: 'merchandise',   name: 'Merchandise',    coords: { lat: 51.5565, lng: -0.2820 } },
  { id: 'main_concourse',name: 'Main Concourse', coords: { lat: 51.5560, lng: -0.2795 } },
];

/**
 * Mount the navigation view.
 * @param {string} rootId
 */
export async function mount(rootId) {
  _root = document.getElementById(rootId);
  if (!_root || _mounted) return;
  _mounted = true;
  _render();
}

export function refresh() {}

function _render() {
  const zoneOptions = ZONES.map(
    (z) => `<option value="${z.id}">${z.name}</option>`
  ).join('');

  _root.innerHTML = `
    <div>
      <div class="section-header mb-4">
        <h1 class="section-title">Navigation</h1>
      </div>

      <div class="card mb-4">
        <form id="nav-form" class="nav-form" aria-label="Navigation route form">
          <div class="form-group">
            <label class="form-label" for="from-zone">From</label>
            <select id="from-zone" class="form-select" aria-required="true">
              <option value="">Select starting zone…</option>
              ${zoneOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="to-zone">To</label>
            <select id="to-zone" class="form-select" aria-required="true">
              <option value="">Select destination…</option>
              ${zoneOptions}
            </select>
          </div>
          <div class="toggle-row" style="border:none;padding:0">
            <span class="toggle-info">Avoid crowded zones</span>
            <label class="toggle-switch" aria-label="Toggle crowd avoidance">
              <input type="checkbox" id="avoid-crowds" checked />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <button type="submit" class="btn btn-primary w-full" id="nav-submit">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="3,11 22,2 13,21 11,13"/></svg>
            Get Directions
          </button>
        </form>
      </div>

      <div id="nav-map-container" style="display:none;margin-bottom:1rem">
        <div id="nav-map-canvas" style="width:100%;height:320px;border-radius:1rem;overflow:hidden;border:1px solid var(--clr-border);"></div>
      </div>

      <div id="route-result" style="display:none">
        <div class="card mb-4" id="route-summary"></div>
        <section aria-label="Step-by-step directions">
          <h2 class="section-title mb-3">Step-by-Step</h2>
          <div id="steps-list" class="steps-list"></div>
        </section>
      </div>

      <section aria-label="Quick navigation shortcuts" class="mt-4">
        <h2 class="section-title mb-3">Quick Routes</h2>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${_quickRoute('Nearest Food with Short Wait', 'main_concourse', 'food_court_b')}
          ${_quickRoute('Nearest Restroom', 'stand_north', 'wc_north_a')}
          ${_quickRoute('Best Exit Route', 'stand_north', 'gate_west')}
        </div>
      </section>
    </div>`;

  document.getElementById('nav-form')?.addEventListener('submit', _handleNavigate);
  _root.querySelectorAll('.quick-route-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const from = btn.dataset.from;
      const to = btn.dataset.to;
      document.getElementById('from-zone').value = from;
      document.getElementById('to-zone').value = to;
      _doNavigate(from, to, true);
    });
  });
}

function _quickRoute(label, from, to) {
  return `<button class="quick-action-btn quick-route-btn" data-from="${from}" data-to="${to}"
    aria-label="Navigate: ${label}" style="flex-direction:row;justify-content:flex-start;gap:0.75rem;min-height:56px">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="3,11 22,2 13,21 11,13"/></svg>
    <span>${label}</span>
  </button>`;
}

async function _handleNavigate(e) {
  e.preventDefault();
  const from = document.getElementById('from-zone')?.value;
  const to = document.getElementById('to-zone')?.value;
  const avoid = document.getElementById('avoid-crowds')?.checked;
  if (!from || !to) { announce('Please select both a starting zone and destination.', 'assertive'); return; }
  if (from === to) { announce('Start and destination are the same zone.', 'assertive'); return; }
  await _doNavigate(from, to, avoid);
}

async function _doNavigate(fromId, toId, avoidCrowds) {
  const submitBtn = document.getElementById('nav-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Finding route…'; }

  const fromZone = ZONES.find((z) => z.id === fromId);
  const toZone   = ZONES.find((z) => z.id === toId);

  try {
    const routeData = await getRoute(fromId, toId, avoidCrowds);
    _showDemoRoute(fromZone, toZone, routeData);
    await _tryRenderMapsRoute(fromZone?.coords, toZone?.coords);
  } catch {
    _showDemoRoute(fromZone, toZone, null);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Get Directions'; }
  }
}

function _showDemoRoute(from, to, data) {
  const result = document.getElementById('route-result');
  const summary = document.getElementById('route-summary');
  const steps = document.getElementById('steps-list');
  if (!result || !summary || !steps) return;

  result.style.display = 'block';
  const avoid = data?.avoid_zones?.length ? `Avoids: ${data.avoid_zones.join(', ')}` : 'Direct route';
  const mins = data?.estimated_minutes || 5;

  summary.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
      <div>
        <div style="font-size:0.7rem;color:var(--clr-text-faint)">Route</div>
        <div style="font-weight:700">${_esc(from?.name || fromId)} → ${_esc(to?.name || toId)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.5rem;font-weight:800;color:var(--clr-success)">${mins} min</div>
        <div style="font-size:0.7rem;color:var(--clr-text-muted)">walking</div>
      </div>
    </div>
    <div style="font-size:0.75rem;color:var(--clr-text-faint);margin-top:0.5rem">${_esc(avoid)}</div>`;

  const demoSteps = [
    `Exit ${_esc(from?.name || '')} heading south`,
    'Follow signs to Main Concourse (3 min)',
    'Turn left at Food Court junction',
    avoidCrowds ? 'Take the less crowded side corridor (avoid peak area)' : 'Continue straight through main corridor',
    `Arrive at ${_esc(to?.name || '')} — ${mins} min total`,
  ];
  steps.innerHTML = demoSteps.map((s, i) => `
    <div class="step-item">
      <div class="step-num">${i + 1}</div>
      <div class="step-text">${s}</div>
    </div>`).join('');

  announce(`Route found: ${from?.name} to ${to?.name}, approximately ${mins} minutes walking`);
}

async function _tryRenderMapsRoute(fromCoords, toCoords) {
  if (!fromCoords || !toCoords) return;
  try {
    await loadGoogleMaps();
    const container = document.getElementById('nav-map-container');
    if (container) container.style.display = 'block';
    if (!_map) _map = initMap('nav-map-canvas', fromCoords, 16);
    const result = await renderRoute(_map, fromCoords, toCoords);
    if (result) {
      const summaryEl = document.getElementById('route-summary');
      if (summaryEl) {
        const badge = summaryEl.querySelector('.maps-distance');
        if (!badge) {
          summaryEl.insertAdjacentHTML('beforeend',
            `<div class="maps-distance" style="font-size:0.75rem;color:var(--clr-success);margin-top:0.5rem">
              Maps: ${result.distance} · ${result.duration}
            </div>`);
        }
      }
    }
  } catch { /* Maps not configured */ }
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
