/**
 * app.js
 * VenuSphere app bootstrap: Firebase init, routing, service worker, announcements.
 */

import { initFirebase, signInAnon, watchAuthState, subscribeToDoc, subscribeToCollection } from './services/firebase-client.js';
import { setLocale } from './utils/i18n.js';
import { announce, showAnnouncementBanner, updateNavAria, showToast } from './utils/a11y.js';
import { startAutopilot } from './services/autopilot-engine.js';
import { initConcierge } from './components/concierge.js';

/** Lazy component loaders keyed by view id. */
const COMPONENT_LOADERS = {
  dashboard: () => import('./components/dashboard.js'),
  map:       () => import('./components/crowd-map.js'),
  assistant: () => import('./components/assistant.js'),
  queue:     () => import('./components/queue-tracker.js'),
  schedule:  () => import('./components/schedule.js'),
};

/** Loaded component instances. */
const _components = {};
/** Current active view id. */
let _currentView = 'dashboard';
/** Unsubscribe function for the announcements listener. */
let _announcementUnsub = null;

// Global routing listeners (attach immediately before any await blocks)
window.addEventListener('hashchange', () => {
  const hashView = window.location.hash.replace('#', '');
  if (COMPONENT_LOADERS[hashView]) navigateTo(hashView);
});

window.addEventListener('vf:navigate', (e) => {
  if (e.detail?.view) {
    if (window.location.hash.replace('#', '') !== e.detail.view) {
      window.location.hash = e.detail.view;
    } else {
      navigateTo(e.detail.view);
    }
  }
});

/** ── Bootstrap ── */
async function bootstrap() {
  const { auth } = initFirebase();

  // Detect & apply saved locale
  const savedLocale = localStorage.getItem('vf_locale') || 'en';
  await setLocale(savedLocale);

  // Apply high-contrast preference
  if (localStorage.getItem('vf_hc') === '1') {
    document.documentElement.classList.add('hc');
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Wire up nav buttons
  document.querySelectorAll('#bottom-nav .nav-btn, #bottom-nav .nav-fab').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // High-contrast toggle
  document.getElementById('btn-hc-toggle')?.addEventListener('click', toggleHighContrast);

  // Auth
  watchAuthState(async (user) => {
    if (!user) {
      try { await signInAnon(); } catch { showToast('Using demo mode — sign in for full features.', 'info'); }
    }
  });

  // Try anon sign-in immediately
  try { await signInAnon(); } catch { /* handled in watchAuthState */ }


  // Load initial view from URL hash
  const hashView = window.location.hash.replace('#', '');
  await navigateTo(COMPONENT_LOADERS[hashView] ? hashView : 'dashboard');

  // Listen for announcements via Firestore onSnapshot
  _startAnnouncementListener();

  // Show current event phase
  _watchEventPhase();

  // Start Crowd Autopilot™ + AI Concierge
  startAutopilot();
  initConcierge();

  // Hide loading overlay
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 450);
  }
}

/**
 * Navigate to a view, lazy-loading its component if needed.
 * @param {string} viewId
 */
async function navigateTo(viewId) {
  if (!COMPONENT_LOADERS[viewId]) return;

  // Hide all views
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));

  // Show target view
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.add('active');
    targetView.focus();
  }

  updateNavAria(viewId);
  window.location.hash = viewId;
  _currentView = viewId;

  // Lazy-load the component module
  if (!_components[viewId]) {
    try {
      const module = await COMPONENT_LOADERS[viewId]();
      _components[viewId] = module;
      if (typeof module.mount === 'function') {
        module.mount(`${viewId === 'map' ? 'map' : viewId}-root`);
      }
    } catch (err) {
      console.error(`Failed to load ${viewId} component`, err);
      announce(`Failed to load ${viewId} view. Please try again.`, 'assertive');
    }
  } else if (typeof _components[viewId].refresh === 'function') {
    _components[viewId].refresh();
  }

  announce(`Navigated to ${viewId} view`);
}

/**
 * Toggle high-contrast mode on the root element.
 */
function toggleHighContrast() {
  const enabled = document.documentElement.classList.toggle('hc');
  localStorage.setItem('vf_hc', enabled ? '1' : '0');
  announce(enabled ? 'High contrast mode enabled' : 'High contrast mode disabled');
}

/**
 * Subscribe to the announcements Firestore collection for real-time banners.
 */
function _startAnnouncementListener() {
  if (_announcementUnsub) _announcementUnsub();
  let seenIds = new Set();

  _announcementUnsub = subscribeToCollection(
    'announcements',
    (items) => {
      const newest = items.find((a) => !seenIds.has(a.id));
      if (!newest) return;
      seenIds.add(newest.id);
      showAnnouncementBanner(newest.message, newest.priority);
    },
    { orderByField: 'created_at', limitTo: 5 }
  );
}

/**
 * Watch the event schedule document and update the phase badge.
 */
function _watchEventPhase() {
  subscribeToCollection('event_schedule', (items) => {
    const schedule = items[0];
    if (!schedule) return;
    const phase = schedule.current_phase || 'pre_event';
    const badge = document.getElementById('phase-badge');
    if (badge) {
      badge.textContent = _phaseLabel(phase);
      badge.dataset.phase = phase;
    }
  }, { limitTo: 1 });
}

/**
 * Map phase id to human-readable label.
 * @param {string} phase
 * @returns {string}
 */
function _phaseLabel(phase) {
  const labels = {
    pre_event:   '● Pre-Event',
    first_half:  '● 1st Half',
    halftime:    '● Half Time',
    second_half: '● 2nd Half',
    post_event:  '● Post-Event',
  };
  return labels[phase] || phase;
}

// Start the app
bootstrap();
