/**
 * settings.js
 * User preferences, accessibility options, theme, language, and auth management.
 */

import { getPreferences, savePreferences } from '../services/api-client.js';
import { signInWithGoogle, signOutUser } from '../services/firebase-client.js';
import { setLocale, getLocale } from '../utils/i18n.js';
import { announce, showToast } from '../utils/a11y.js';

let _root = null;
let _prefs = {
  dietary: [], accessibility: [], favorite_cuisines: [],
  seating_section: '', language: 'en', high_contrast: false, notifications_enabled: true,
};

const DIETARY_OPTIONS = ['vegan', 'halal', 'gluten-free', 'nut-free', 'vegetarian'];
const ACCESS_OPTIONS  = ['wheelchair', 'hearing_loop', 'large_text'];
const CUISINE_OPTIONS = ['burgers', 'pizza', 'asian', 'grilled', 'beverages'];
const LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'hi', label: '🇮🇳 हिन्दी' },
  { code: 'zh', label: '🇨🇳 中文' },
];

/**
 * Mount the settings view.
 * @param {string} rootId
 */
export async function mount(rootId) {
  _root = document.getElementById(rootId);
  if (!_root) return;
  await _loadPrefs();
  _render();
}

export function refresh() {}

async function _loadPrefs() {
  const saved = localStorage.getItem('vf_prefs');
  if (saved) {
    try { _prefs = { ..._prefs, ...JSON.parse(saved) }; } catch {}
  }
  try {
    const resp = await getPreferences();
    if (resp.preferences && Object.keys(resp.preferences).length) {
      _prefs = { ..._prefs, ...resp.preferences };
    }
  } catch {}
}

function _render() {
  _root.innerHTML = `
    <div>
      <div class="section-header mb-6">
        <h1 class="section-title">Settings</h1>
      </div>

      <!-- Dietary & Food -->
      <section class="settings-section" aria-labelledby="dietary-heading">
        <h2 class="settings-section-title" id="dietary-heading">Dietary Preferences</h2>
        <div class="chip-group mb-4" role="group" aria-label="Select dietary restrictions">
          ${DIETARY_OPTIONS.map((d) => `
            <button class="chip-toggle ${_prefs.dietary.includes(d) ? 'selected' : ''}"
              data-group="dietary" data-val="${d}" aria-pressed="${_prefs.dietary.includes(d)}"
              aria-label="${d}">
              ${d.charAt(0).toUpperCase() + d.slice(1)}
            </button>`).join('')}
        </div>
      </section>

      <!-- Accessibility -->
      <section class="settings-section" aria-labelledby="access-heading">
        <h2 class="settings-section-title" id="access-heading">Accessibility Needs</h2>
        <div class="chip-group mb-4" role="group" aria-label="Select accessibility needs">
          ${ACCESS_OPTIONS.map((a) => `
            <button class="chip-toggle ${_prefs.accessibility.includes(a) ? 'selected' : ''}"
              data-group="accessibility" data-val="${a}" aria-pressed="${_prefs.accessibility.includes(a)}"
              aria-label="${_ac11yLabel(a)}">
              ${_ac11yLabel(a)}
            </button>`).join('')}
        </div>
      </section>

      <!-- Favourite Cuisines -->
      <section class="settings-section" aria-labelledby="cuisine-heading">
        <h2 class="settings-section-title" id="cuisine-heading">Favourite Food Types</h2>
        <div class="chip-group mb-4" role="group" aria-label="Select favourite cuisines">
          ${CUISINE_OPTIONS.map((c) => `
            <button class="chip-toggle ${_prefs.favorite_cuisines.includes(c) ? 'selected' : ''}"
              data-group="favorite_cuisines" data-val="${c}" aria-pressed="${_prefs.favorite_cuisines.includes(c)}"
              aria-label="${c}">
              ${c.charAt(0).toUpperCase() + c.slice(1)}
            </button>`).join('')}
        </div>
      </section>

      <!-- Seating Section -->
      <section class="settings-section" aria-labelledby="seating-heading">
        <h2 class="settings-section-title" id="seating-heading">Seating Section</h2>
        <input type="text" id="seating-input" class="form-select" placeholder="e.g. Block A, Row 12"
          value="${_esc(_prefs.seating_section)}" maxlength="50"
          aria-label="Your seating section" style="margin-bottom:1rem" />
      </section>

      <!-- Language -->
      <section class="settings-section" aria-labelledby="lang-heading">
        <h2 class="settings-section-title" id="lang-heading">Language</h2>
        <div class="chip-group mb-4" role="group" aria-label="Select language">
          ${LANGUAGES.map((l) => `
            <button class="chip-toggle ${_prefs.language === l.code ? 'selected' : ''}"
              data-group="language" data-val="${l.code}" data-single="true"
              aria-pressed="${_prefs.language === l.code}" aria-label="${l.label}">
              ${l.label}
            </button>`).join('')}
        </div>
      </section>

      <!-- Display -->
      <section class="settings-section" aria-labelledby="display-heading">
        <h2 class="settings-section-title" id="display-heading">Display</h2>
        <div class="toggle-row">
          <span class="toggle-info">High Contrast Mode</span>
          <label class="toggle-switch" aria-label="Toggle high contrast mode">
            <input type="checkbox" id="hc-toggle" ${_prefs.high_contrast ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="toggle-row">
          <span class="toggle-info">Push Notifications</span>
          <label class="toggle-switch" aria-label="Toggle push notifications">
            <input type="checkbox" id="notif-toggle" ${_prefs.notifications_enabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </section>

      <!-- Save Button -->
      <button class="btn btn-primary w-full mb-4" id="save-prefs-btn" aria-label="Save all preferences">
        Save Preferences
      </button>

      <!-- Auth -->
      <section class="settings-section" aria-labelledby="auth-heading">
        <h2 class="settings-section-title" id="auth-heading">Account</h2>
        <button class="btn btn-ghost w-full mb-3" id="google-signin-btn" aria-label="Sign in with Google for cross-device sync">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign in with Google
        </button>
        <button class="btn btn-ghost w-full" id="signout-btn" aria-label="Sign out" style="color:var(--clr-danger);border-color:rgba(239,71,111,0.3)">
          Sign Out
        </button>
      </section>

      <div style="text-align:center;padding:1.5rem 0;color:var(--clr-text-faint);font-size:0.7rem">
        VenueFlow v1.0 · Olympic Stadium · Championship Final 2026
      </div>
    </div>`;

  _bindEvents();
}

function _bindEvents() {
  // Multi-select chips
  _root.querySelectorAll('.chip-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      const val   = btn.dataset.val;
      const isSingle = btn.dataset.single === 'true';

      if (isSingle) {
        _prefs[group] = val;
        _root.querySelectorAll(`[data-group="${group}"]`).forEach((b) => {
          b.classList.toggle('selected', b.dataset.val === val);
          b.setAttribute('aria-pressed', b.dataset.val === val);
        });
        if (group === 'language') {
          setLocale(val);
          localStorage.setItem('vf_locale', val);
          announce(`Language set to ${LANGUAGES.find((l) => l.code === val)?.label || val}`);
        }
      } else {
        const arr = _prefs[group];
        const idx = arr.indexOf(val);
        if (idx === -1) { arr.push(val); btn.classList.add('selected'); btn.setAttribute('aria-pressed', 'true'); }
        else { arr.splice(idx, 1); btn.classList.remove('selected'); btn.setAttribute('aria-pressed', 'false'); }
      }
    });
  });

  // High contrast toggle
  document.getElementById('hc-toggle')?.addEventListener('change', (e) => {
    _prefs.high_contrast = e.target.checked;
    document.documentElement.classList.toggle('hc', e.target.checked);
    localStorage.setItem('vf_hc', e.target.checked ? '1' : '0');
    announce(`High contrast ${e.target.checked ? 'enabled' : 'disabled'}`);
  });

  // Notifications toggle
  document.getElementById('notif-toggle')?.addEventListener('change', (e) => {
    _prefs.notifications_enabled = e.target.checked;
  });

  // Save
  document.getElementById('save-prefs-btn')?.addEventListener('click', _savePrefs);

  // Auth buttons
  document.getElementById('google-signin-btn')?.addEventListener('click', async () => {
    try { await signInWithGoogle(); showToast('Signed in with Google!', 'success'); }
    catch { showToast('Sign-in cancelled or unavailable in demo mode.', 'info'); }
  });
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    try { await signOutUser(); showToast('Signed out successfully.', 'info'); }
    catch { showToast('Unable to sign out.', 'error'); }
  });
}

async function _savePrefs() {
  _prefs.seating_section = document.getElementById('seating-input')?.value || '';
  localStorage.setItem('vf_prefs', JSON.stringify(_prefs));
  try { await savePreferences(_prefs); } catch {}
  showToast('Preferences saved!', 'success');
  announce('Your preferences have been saved');
}

function _ac11yLabel(key) {
  return { wheelchair: '♿ Wheelchair', hearing_loop: '🔊 Hearing Loop', large_text: '🔤 Large Text' }[key] || key;
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
