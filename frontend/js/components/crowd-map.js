/**
 * crowd-map.js
 * Zone-based venue crowd density map using Google Maps JS API.
 * Lazy-loads Maps only when the map view becomes active.
 */

import { loadGoogleMaps, initMap, addZonePolygon, updateZoneColor } from '/js/services/maps-client.js';
import { getCrowdData, getZoneCrowd } from '/js/services/api-client.js';
import { subscribeToCollection } from '/js/services/firebase-client.js';
import { announce, showToast } from '/js/utils/a11y.js';

const VENUE_CENTER = { lat: 51.5560, lng: -0.2795 };

/** @type {google.maps.Map | null} */
let _map = null;
let _mounted = false;
let _unsub = null;

/** Demo zone data for display without live API. */
const DEMO_ZONES = [
  { id: 'gate_north', name: 'Gate North', label: 'high', density: 0.75, trend: 'stable',
    polygon: [{ lat: 51.5598, lng: -0.2810 }, { lat: 51.5602, lng: -0.2810 }, { lat: 51.5602, lng: -0.2780 }, { lat: 51.5598, lng: -0.2780 }] },
  { id: 'gate_south', name: 'Gate South', label: 'high', density: 0.70, trend: 'stable',
    polygon: [{ lat: 51.5518, lng: -0.2810 }, { lat: 51.5522, lng: -0.2810 }, { lat: 51.5522, lng: -0.2780 }, { lat: 51.5518, lng: -0.2780 }] },
  { id: 'stand_north', name: 'North Stand', label: 'low', density: 0.30, trend: 'stable',
    polygon: [{ lat: 51.5580, lng: -0.2830 }, { lat: 51.5590, lng: -0.2830 }, { lat: 51.5590, lng: -0.2760 }, { lat: 51.5580, lng: -0.2760 }] },
  { id: 'food_court_a', name: 'Food Court A', label: 'moderate', density: 0.40, trend: 'stable',
    polygon: [{ lat: 51.5569, lng: -0.2820 }, { lat: 51.5575, lng: -0.2820 }, { lat: 51.5575, lng: -0.2800 }, { lat: 51.5569, lng: -0.2800 }] },
  { id: 'food_court_b', name: 'Food Court B', label: 'moderate', density: 0.35, trend: 'stable',
    polygon: [{ lat: 51.5545, lng: -0.2790 }, { lat: 51.5551, lng: -0.2790 }, { lat: 51.5551, lng: -0.2770 }, { lat: 51.5545, lng: -0.2770 }] },
  { id: 'merchandise', name: 'Merchandise', label: 'moderate', density: 0.55, trend: 'increasing',
    polygon: [{ lat: 51.5562, lng: -0.2828 }, { lat: 51.5568, lng: -0.2828 }, { lat: 51.5568, lng: -0.2812 }, { lat: 51.5562, lng: -0.2812 }] },
  { id: 'main_concourse', name: 'Main Concourse', label: 'moderate', density: 0.50, trend: 'stable',
    polygon: [{ lat: 51.5545, lng: -0.2820 }, { lat: 51.5575, lng: -0.2820 }, { lat: 51.5575, lng: -0.2770 }, { lat: 51.5545, lng: -0.2770 }] },
];

/**
 * Mount the crowd map view.
 * @param {string} rootId
 */
export async function mount(rootId) {
  const root = document.getElementById(rootId);
  if (!root || _mounted) return;
  _mounted = true;

  root.innerHTML = `
    <div class="map-view-wrap">
      <div class="section-header mb-3">
        <h1 class="section-title">Crowd Map</h1>
        <span class="live-dot">Live</span>
      </div>

      <div id="map-api-banner" class="config-banner" role="alert" hidden>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Maps API key not configured — showing zone list below. Add your key to <code>maps-client.js</code>.</span>
      </div>

      <div id="map-canvas" role="application" aria-label="Venue crowd density map" style="min-height:360px;border-radius:1rem;overflow:hidden;background:var(--clr-surface-2);display:flex;align-items:center;justify-content:center;">
        <div class="loading-ring" aria-hidden="true"></div>
      </div>

      <div class="map-legend mt-3" aria-label="Density legend">
        <div class="legend-item"><span class="density-dot density-low" aria-hidden="true"></span> Low (&lt;30%)</div>
        <div class="legend-item"><span class="density-dot density-moderate" aria-hidden="true"></span> Moderate (30-60%)</div>
        <div class="legend-item"><span class="density-dot density-high" aria-hidden="true"></span> High (60-80%)</div>
        <div class="legend-item"><span class="density-dot density-critical" aria-hidden="true"></span> Critical (&gt;80%)</div>
      </div>

      <div id="zone-info-panel" class="zone-info-panel hidden" role="region" aria-live="polite" aria-label="Zone details"></div>

      <section class="zone-list-a11y" aria-label="Zone density list (screen reader accessible)">
        <h2 class="section-title mb-3" style="margin-top:1.5rem">All Zones</h2>
        <div id="zone-a11y-list" role="list">
          ${_renderZoneA11yList(DEMO_ZONES)}
        </div>
      </section>
    </div>`;

  await _loadMap();
  _subscribeToUpdates();
}

/** Refresh zone colors when navigating back. */
export function refresh() {
  _fetchAndUpdateZones();
}

async function _loadMap() {
  try {
    await loadGoogleMaps();
    _map = initMap('map-canvas', VENUE_CENTER, 16);
    const zones = await _fetchZones();
    zones.forEach((zone) => {
      addZonePolygon(_map, zone, _onZoneClick);
    });
    _updateA11yList(zones);
  } catch (err) {
    const banner = document.getElementById('map-api-banner');
    if (banner) banner.removeAttribute('hidden');
    const canvas = document.getElementById('map-canvas');
    if (canvas) canvas.innerHTML = `<p style="color:var(--clr-text-muted);font-size:0.875rem;padding:1rem;text-align:center">Map unavailable — configure your Maps API key to enable interactive map.</p>`;
  }
}

async function _fetchZones() {
  try {
    const resp = await getCrowdData();
    if (resp.zones && resp.zones.length > 0) {
      // Map API outputs `zone_id`. Map expects `id`.
      return resp.zones.map(z => ({ ...z, id: z.zone_id }));
    }
    throw new Error('No zones returned');
  } catch {
    return DEMO_ZONES;
  }
}

async function _fetchAndUpdateZones() {
  const zones = await _fetchZones();
  zones.forEach((z) => updateZoneColor(z.id, z.label || 'unknown'));
  _updateA11yList(zones);
}

function _subscribeToUpdates() {
  if (_unsub) _unsub();
  _unsub = subscribeToCollection('crowd_density', (items) => {
    items.forEach((item) => {
      updateZoneColor(item.zone_id, _densityLabel(item.density));
    });
  });
}

async function _onZoneClick(zone) {
  const panel = document.getElementById('zone-info-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
    <span class="density-dot density-${zone.label}" aria-hidden="true"></span>
    <strong>${_esc(zone.name || zone.id)}</strong>
  </div>
  <div class="skeleton" style="height:60px;border-radius:0.5rem"></div>`;

  announce(`Loading details for ${zone.name || zone.id}`);

  try {
    const data = await getZoneCrowd(zone.id);
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
        <span class="density-dot density-${data.label}" aria-hidden="true"></span>
        <strong>${_esc(zone.name)}</strong>
        <span class="trend-arrow trend-${data.trend}">${data.trend === 'increasing' ? '↑' : data.trend === 'decreasing' ? '↓' : '→'}</span>
      </div>
      <div class="density-bar-track mb-3" aria-label="Density: ${Math.round(data.density * 100)}%">
        <div class="density-bar-fill density-${data.label}" style="width:${Math.round(data.density * 100)}%;background:var(--density-${data.label})"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;text-align:center">
        <div>
          <div style="font-size:1.25rem;font-weight:700">${Math.round(data.density * 100)}%</div>
          <div style="font-size:0.7rem;color:var(--clr-text-muted)">Now</div>
        </div>
        <div>
          <div style="font-size:1.25rem;font-weight:700">${Math.round((data.prediction_15?.predicted_density || data.density) * 100)}%</div>
          <div style="font-size:0.7rem;color:var(--clr-text-muted)">In 15 min</div>
        </div>
        <div>
          <div style="font-size:1.25rem;font-weight:700">${Math.round((data.prediction_30?.predicted_density || data.density) * 100)}%</div>
          <div style="font-size:0.7rem;color:var(--clr-text-muted)">In 30 min</div>
        </div>
      </div>
      <p style="font-size:0.75rem;color:var(--clr-text-muted);margin-top:0.5rem">Status: <strong class="density-${data.label}">${data.label}</strong></p>`;
    announce(`${zone.name}: ${Math.round(data.density * 100)}% density, ${data.trend}`);
  } catch {
    panel.innerHTML = `<p style="color:var(--clr-text-muted);font-size:0.875rem">${_esc(zone.name)} — density: ${Math.round((zone.density || 0) * 100)}%</p>`;
  }
}

function _renderZoneA11yList(zones) {
  return zones.map((z) => `
    <div class="zone-list-item" role="listitem">
      <span>${_esc(z.name)}</span>
      <span style="display:flex;align-items:center;gap:0.5rem">
        <span class="density-dot density-${z.label}" aria-hidden="true"></span>
        <span style="font-size:0.75rem;color:var(--clr-text-muted)">${Math.round(z.density * 100)}%</span>
      </span>
    </div>`).join('');
}

function _updateA11yList(zones) {
  const el = document.getElementById('zone-a11y-list');
  if (el) el.innerHTML = _renderZoneA11yList(zones);
}

function _densityLabel(density) {
  if (density < 0.3) return 'low';
  if (density < 0.6) return 'moderate';
  if (density < 0.8) return 'high';
  return 'critical';
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
