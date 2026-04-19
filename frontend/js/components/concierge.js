/**
 * concierge.js
 * Proactive AI Concierge — Floating smart nudge system.
 *
 * Unlike a chatbot that waits for input, the Concierge pushes
 * context-aware recommendations to users as dismissible floating cards.
 * Powered by Crowd Autopilot™ predictions.
 */

import { onPrediction, getPredictions } from '../services/autopilot-engine.js';
import { announce } from '../utils/a11y.js';

let _container = null;
let _dismissedIds = new Set();
let _maxVisible = 2;
let _unsub = null;

/**
 * Initialize the Concierge system.
 * Call once during app bootstrap after the DOM is ready.
 */
export function initConcierge() {
  _container = document.getElementById('concierge-tray');
  if (!_container) return;

  // Load previously dismissed nudge IDs from this session
  try {
    const saved = sessionStorage.getItem('vf_dismissed_nudges');
    if (saved) _dismissedIds = new Set(JSON.parse(saved));
  } catch { /* ignore */ }

  // Listen for Autopilot predictions
  _unsub = onPrediction(_handlePredictions);

  // Also handle initial predictions if engine already running
  const existing = getPredictions();
  if (existing.length) _handlePredictions(existing);
}

/**
 * Destroy the Concierge system.
 */
export function destroyConcierge() {
  if (_unsub) _unsub();
  if (_container) _container.innerHTML = '';
}

function _handlePredictions(predictions) {
  if (!_container) return;

  // Filter out dismissed and old predictions
  const active = predictions
    .filter(p => !_dismissedIds.has(p.id))
    .sort((a, b) => _severityRank(b.severity) - _severityRank(a.severity))
    .slice(0, _maxVisible);

  // Remove nudges that are no longer active
  _container.querySelectorAll('.concierge-nudge').forEach(el => {
    const nudgeId = el.dataset.nudgeId;
    if (!active.find(p => p.id === nudgeId)) {
      el.classList.add('nudge-exit');
      setTimeout(() => el.remove(), 350);
    }
  });

  // Add new nudges
  active.forEach((prediction, idx) => {
    if (_container.querySelector(`[data-nudge-id="${prediction.id}"]`)) return;
    const nudge = _createNudge(prediction, idx);
    _container.appendChild(nudge);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => nudge.classList.add('nudge-visible'));
    });

    // Announce to screen readers
    announce(_stripHtml(prediction.message), 'polite');
  });
}

function _createNudge(prediction, index) {
  const nudge = document.createElement('div');
  nudge.className = `concierge-nudge nudge-${prediction.severity}`;
  nudge.dataset.nudgeId = prediction.id;
  nudge.setAttribute('role', 'status');
  nudge.setAttribute('aria-live', 'polite');
  nudge.style.animationDelay = `${index * 100}ms`;

  const icon = _getIcon(prediction);
  const savings = prediction.savingsMinutes
    ? `<span class="nudge-savings">Save ${prediction.savingsMinutes} min</span>`
    : '';
  const alternate = prediction.alternateZone
    ? `<div class="nudge-alt">→ Try <strong>${prediction.alternateZone}</strong></div>`
    : '';

  nudge.innerHTML = `
    <div class="nudge-content">
      <div class="nudge-icon" aria-hidden="true">${icon}</div>
      <div class="nudge-body">
        <div class="nudge-message">${_esc(prediction.message)}</div>
        ${alternate}
      </div>
      ${savings}
      <button class="nudge-dismiss" aria-label="Dismiss this suggestion">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;

  // Dismiss handler
  nudge.querySelector('.nudge-dismiss').addEventListener('click', (e) => {
    e.stopPropagation();
    _dismiss(prediction.id, nudge);
  });

  // Auto-dismiss after 20s for info-level nudges
  if (prediction.severity === 'info') {
    setTimeout(() => {
      if (nudge.isConnected) _dismiss(prediction.id, nudge);
    }, 20000);
  }

  return nudge;
}

function _dismiss(id, el) {
  _dismissedIds.add(id);
  try {
    sessionStorage.setItem('vf_dismissed_nudges', JSON.stringify([..._dismissedIds]));
  } catch { /* ignore */ }
  el.classList.add('nudge-exit');
  setTimeout(() => el.remove(), 350);
}

function _getIcon(prediction) {
  switch (prediction.type) {
    case 'surge_warning': return '⚡';
    case 'queue_alert':   return '⏱️';
    case 'opportunity':   return '✨';
    case 'timing':        return '🚀';
    default:              return '💡';
  }
}

function _severityRank(sev) {
  return { critical: 3, warning: 2, info: 1 }[sev] || 0;
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function _stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '');
}
