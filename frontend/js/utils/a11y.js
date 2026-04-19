/**
 * a11y.js
 * Accessibility helpers: aria-live announcements, focus trapping, and focus management.
 */

/** @type {HTMLElement | null} */
let _announceEl = null;

/**
 * Announce a message to screen readers via an aria-live region.
 * @param {string} message - Text to announce.
 * @param {'polite' | 'assertive'} [politeness='polite']
 */
export function announce(message, politeness = 'polite') {
  if (!_announceEl) {
    _announceEl = document.getElementById('announcements');
    if (!_announceEl) {
      _announceEl = document.createElement('div');
      _announceEl.setAttribute('aria-live', politeness);
      _announceEl.setAttribute('aria-atomic', 'true');
      _announceEl.className = 'visually-hidden';
      document.body.appendChild(_announceEl);
    }
  }
  _announceEl.setAttribute('aria-live', politeness);
  _announceEl.textContent = '';
  requestAnimationFrame(() => { _announceEl.textContent = message; });
}

/**
 * Show a banner announcement visible on screen (not just to screen readers).
 * @param {string} message
 * @param {'normal' | 'high' | 'emergency'} [priority='normal']
 */
export function showAnnouncementBanner(message, priority = 'normal') {
  const banner = document.getElementById('announcements');
  if (!banner) return;
  banner.textContent = message;
  banner.classList.remove('visually-hidden', 'emergency');
  if (priority === 'emergency') banner.classList.add('emergency');
  announce(message, priority === 'emergency' ? 'assertive' : 'polite');
  setTimeout(() => { banner.classList.add('visually-hidden'); }, 8000);
}

/** @type {AbortController | null} */
let _focusTrapController = null;

const FOCUSABLE_SELECTORS = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Trap keyboard focus within an element (for modals and drawers).
 * @param {HTMLElement} container
 * @param {() => void} [onEscape] Optional callback when Escape is pressed.
 * @returns {() => void} Function to release the trap.
 */
export function trapFocus(container, onEscape) {
  if (_focusTrapController) _focusTrapController.abort();
  _focusTrapController = new AbortController();
  const { signal } = _focusTrapController;

  const focusable = () => [...container.querySelectorAll(FOCUSABLE_SELECTORS)];

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && typeof onEscape === 'function') {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  document.addEventListener('keydown', onKeyDown, { signal });
  const items = focusable();
  if (items.length) items[0].focus();

  return () => _focusTrapController?.abort();
}

/**
 * Release the current focus trap.
 */
export function releaseFocusTrap() {
  _focusTrapController?.abort();
  _focusTrapController = null;
}

/**
 * Restore focus to a previously focused element after navigation.
 * @param {HTMLElement | null} returnTarget - Element to return focus to.
 */
export function restoreFocus(returnTarget) {
  if (returnTarget && typeof returnTarget.focus === 'function') {
    returnTarget.focus();
  }
}

/**
 * Set aria-current="page" on the active nav item and remove from others.
 * @param {string} viewId - Active view identifier (e.g. 'dashboard').
 */
export function updateNavAria(viewId) {
  document.querySelectorAll('#bottom-nav .nav-btn, #bottom-nav .nav-fab').forEach((btn) => {
    const isActive = btn.dataset.view === viewId;
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    btn.classList.toggle('active', isActive);
  });
}

/**
 * Show a toast notification accessible to screen readers.
 * @param {string} message
 * @param {'success' | 'warning' | 'error' | 'info'} [type='info']
 * @param {number} [durationMs=4000]
 */
export function showToast(message, type = 'info', durationMs = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  container.appendChild(toast);
  announce(message, type === 'error' ? 'assertive' : 'polite');

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 300ms';
    setTimeout(() => toast.remove(), 320);
  }, durationMs);
}

/**
 * Check if the user prefers reduced motion.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Initialize skip link behavior to focus the main content area.
 */
export function initSkipLink() {
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      const main = document.getElementById('main-content');
      if (main) {
        main.tabIndex = -1;
        main.focus();
      }
    });
  }
}
