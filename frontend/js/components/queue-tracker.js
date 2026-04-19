/**
 * queue-tracker.js
 * Live wait time tracker for food stalls, restrooms, and merchandise.
 */

import { getQueueData } from '/js/services/api-client.js';
import { subscribeToCollection } from '/js/services/firebase-client.js';
import { announce, showToast } from '/js/utils/a11y.js';

let _root = null;
let _allQueues = [];
let _activeFilter = 'all';
let _unsub = null;

const STALL_META = {
  stall_1: { name: 'Biryani House', type: 'food', icon: '🍛', zone: 'Food Court A' },
  stall_2: { name: 'Chaat Corner', type: 'food', icon: '🥘', zone: 'Food Court A' },
  stall_3: { name: 'Samosa Stand', type: 'food', icon: '🥟', zone: 'Food Court A' },
  stall_4: { name: 'Kebabs & Rolls', type: 'food', icon: '🌯', zone: 'Food Court B' },
  stall_5: { name: 'Dosa Point', type: 'food', icon: '🥞', zone: 'Food Court B' },
  stall_6: { name: 'Beer Garden', type: 'beverage', icon: '🍺', zone: 'Food Court A' },
  stall_7: { name: 'Smoothie Bar', type: 'beverage', icon: '🥤', zone: 'Food Court B' },
  stall_8: { name: 'Merch Shop', type: 'merchandise', icon: '👕', zone: 'Merchandise' },
  wc_north_a: { name: 'Restroom North A', type: 'restroom', icon: '🚻', zone: 'North Stand' },
  wc_north_b: { name: 'Restroom North B', type: 'restroom', icon: '🚻', zone: 'Gate North' },
  wc_south_a: { name: 'Restroom South A', type: 'restroom', icon: '🚻', zone: 'South Stand' },
  wc_south_b: { name: 'Restroom South B', type: 'restroom', icon: '🚻', zone: 'Gate South' },
  wc_east: { name: 'Restroom East', type: 'restroom', icon: '🚻', zone: 'East Stand' },
  wc_west: { name: 'Restroom West', type: 'restroom', icon: '🚻', zone: 'West Stand' },
};

const DEMO_QUEUES = Object.entries(STALL_META).map(([id, meta]) => ({
  stall_id: id,
  wait_minutes: Math.floor(Math.random() * 15) + 1,
  trend: ['stable', 'increasing', 'decreasing'][Math.floor(Math.random() * 3)],
  prediction_15: Math.floor(Math.random() * 20) + 1,
  prediction_30: Math.floor(Math.random() * 15) + 1,
  phase: 'pre_event',
}));


function _checkForFilterParam() {
  window.addEventListener('vf:navigate', (e) => {
    if (e.detail?.view === 'queue' && e.detail?.filter) {
      setTimeout(() => _applyFilter(e.detail.filter), 50);
    }
  }, { once: true });
}

function _applyFilter(filter) {
  _activeFilter = filter;
  _root.querySelectorAll('[data-filter]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.filter === _activeFilter);
    b.setAttribute('aria-selected', b.dataset.filter === _activeFilter);
  });
  _updateGrid();
  announce(`Showing ${_filterLabel(_activeFilter)} queues`);
}

/**
 * Mount the queue tracker view.
 * @param {string} rootId
 */
export function mount(rootId) {
  _root = document.getElementById(rootId);
  if (!_root) return;
  _allQueues = DEMO_QUEUES;
  _render();
  _fetchQueues();
  _subscribeToLive();
  _checkForFilterParam();
}

export function refresh() {
  _fetchQueues();
  _checkForFilterParam();
}

function _render() {
  _root.innerHTML = `
    <div>
      <div class="section-header mb-4">
        <h1 class="section-title">Wait Times</h1>
        <span class="live-dot" aria-label="Live data">Live</span>
      </div>

      <div role="tablist" aria-label="Filter by type" class="chip-group mb-4" style="gap:0.5rem">
        ${['all', 'food', 'beverage', 'restroom', 'merchandise'].map((f) => `
          <button role="tab" aria-selected="${f === _activeFilter}" class="chip-toggle ${f === _activeFilter ? 'selected' : ''}" data-filter="${f}">
            ${_filterLabel(f)}
          </button>`).join('')}
      </div>

      <div id="queue-grid" class="queue-grid" role="list" aria-label="Wait times by stall">
        ${_renderGrid()}
      </div>
    </div>`;

  _root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      _applyFilter(btn.dataset.filter);
    });
  });
}

function _renderGrid() {
  const filtered = _filtered();
  if (!filtered.length) return `<p style="color:var(--clr-text-muted);font-size:0.875rem;padding:1rem 0">No items in this category.</p>`;
  return filtered.map(_renderCard).join('');
}

function _renderCard(q) {
  const meta = STALL_META[q.stall_id] || { name: q.stall_id, type: 'food', icon: '📍', zone: '' };
  const wait = q.wait_minutes || 0;
  const badgeClass = wait <= 5 ? 'short' : wait <= 15 ? 'medium' : 'long';
  const barPct = Math.min(100, (wait / 35) * 100);
  const barColor = wait <= 5 ? 'var(--density-low)' : wait <= 15 ? 'var(--density-moderate)' : 'var(--density-critical)';
  const trendStr = q.trend === 'increasing' ? '↑ Rising' : q.trend === 'decreasing' ? '↓ Falling' : '→ Stable';

  // Fallback to current wait if predictions are missing from live firestore data
  const pred15 = q.prediction_15 ?? wait;
  const pred30 = q.prediction_30 ?? wait;

  // Has an alert already been set?
  const isAlertSet = _activeAlerts.has(q.stall_id);

  return `<div class="queue-card" role="listitem" id="qcard-${q.stall_id}">
    <div class="queue-card-header">
      <div style="display:flex;align-items:center;gap:0.5rem">
        <span style="font-size:1.25rem" aria-hidden="true">${meta.icon}</span>
        <div>
          <div class="queue-stall-name">${_esc(meta.name)}</div>
          <div style="font-size:0.7rem;color:var(--clr-text-faint)">${_esc(meta.zone)}</div>
        </div>
      </div>
      <span class="queue-wait-badge ${badgeClass}" aria-label="${wait} minute wait">${wait} min</span>
    </div>
    <div class="density-bar-track" aria-hidden="true">
      <div class="density-bar-fill" style="width:${barPct.toFixed(0)}%;background:${barColor}"></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.7rem;color:var(--clr-text-faint)">
      <span class="trend-arrow trend-${q.trend || 'stable'}" aria-label="Trend: ${q.trend || 'stable'}">${trendStr}</span>
      <span>15min: <strong>${pred15}m</strong> · 30min: <strong>${pred30}m</strong></span>
    </div>
    <button class="btn btn-ghost" style="width:100%;font-size:0.75rem;padding:0.5rem;min-height:40px;margin-top:0.25rem"
      aria-label="${isAlertSet ? 'Alert already set' : `Alert me when ${_esc(meta.name)} wait drops below 5 minutes`}"
      data-stall="${q.stall_id}" ${isAlertSet ? 'disabled' : ''}>
      ${isAlertSet ? '✓ Alert set' : '🔔 Alert me when &lt; 5 min'}
    </button>
  </div>`;
}

function _updateGrid() {
  const grid = document.getElementById('queue-grid');
  if (grid) { grid.innerHTML = _renderGrid(); _bindAlertButtons(); }
}

const _activeAlerts = new Set();

function _bindAlertButtons() {
  _root.querySelectorAll('[data-stall]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const stallId = btn.dataset.stall;
      const meta = STALL_META[stallId] || { name: stallId };

      // Request native notification permissions
      if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        await Notification.requestPermission();
      }

      _activeAlerts.add(stallId);
      showToast(`Alert set for ${meta.name} — we'll notify you when wait < 5 min!`, 'success');

      btn.textContent = '✓ Alert set';
      btn.disabled = true;
    });
  });
}

async function _fetchQueues() {
  try {
    const resp = await getQueueData();
    if (resp.queues?.length) {
      _allQueues = resp.queues;
      _updateGrid();
    }
  } catch { /* keep demo data */ }
}

function _subscribeToLive() {
  if (_unsub) _unsub();
  _unsub = subscribeToCollection('queue_times', (items) => {
    if (!items.length) return;
    const byId = {};
    items.forEach((i) => { byId[i.stall_id] = i; });

    // Check if any tracked alerts just triggered
    _activeAlerts.forEach(stallId => {
      const update = byId[stallId];
      if (update && update.wait_minutes <= 5) {
        const meta = STALL_META[stallId] || { name: stallId };

        // Trigger push notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('VenuSphere Alert', {
            body: `The wait time at ${meta.name} has dropped to ${update.wait_minutes} minutes!`,
            icon: '/assets/icons/icon-192x192.png'
          });
        } else {
          // Fallback to in-app toast
          showToast(`🔔 The wait time at ${meta.name} is now ${update.wait_minutes} min!`, 'success');
        }

        // Remove from tracking so it doesn't spam
        _activeAlerts.delete(stallId);
      }
    });

    _allQueues = _allQueues.map((q) => {
      const live = byId[q.stall_id];
      if (!live) return q;
      const merged = { ...q, ...live };
      // Preserve prediction fields from demo data if live data lacks them
      merged.prediction_15 = live.prediction_15 ?? q.prediction_15 ?? merged.wait_minutes;
      merged.prediction_30 = live.prediction_30 ?? q.prediction_30 ?? merged.wait_minutes;
      return merged;
    });

    _updateGrid();
  });
}

function _filtered() {
  if (_activeFilter === 'all') return _allQueues;
  return _allQueues.filter((q) => (STALL_META[q.stall_id]?.type || 'food') === _activeFilter);
}

function _filterLabel(f) {
  return { all: 'All', food: '🍔 Food', beverage: '🥤 Drinks', restroom: '🚻 Restrooms', merchandise: '👕 Merch' }[f] || f;
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
