/**
 * i18n.js
 * Lightweight internationalisation: loads locale JSON, translates [data-i18n] elements.
 */

/** @type {{ [key: string]: string }} */
let _translations = {};
let _currentLocale = 'en';

const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'hi', 'zh'];

/**
 * Load a locale JSON file and apply translations.
 * @param {string} locale - ISO 639-1 locale code (e.g. 'en', 'es').
 * @returns {Promise<void>}
 */
export async function setLocale(locale) {
  const code = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  if (code === _currentLocale && Object.keys(_translations).length) return;
  try {
    const res = await fetch(`/assets/locales/${code}.json`);
    _translations = await res.json();
    _currentLocale = code;
    document.documentElement.lang = code;
    _applyTranslations();
  } catch {
    if (code !== 'en') await setLocale('en');
  }
}

/**
 * Translate a key with optional interpolation.
 * @param {string} key - Dot-notation key (e.g. 'nav.dashboard').
 * @param {Object} [params] - Values to interpolate (e.g. { count: 3 }).
 * @returns {string} Translated string, or key if not found.
 */
export function t(key, params = {}) {
  let text = _translations[key] || key;
  Object.entries(params).forEach(([k, v]) => {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  });
  return text;
}

/**
 * Get the current active locale code.
 * @returns {string}
 */
export function getLocale() {
  return _currentLocale;
}

/**
 * Apply translations to all elements with [data-i18n] attribute.
 */
function _applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (el.placeholder !== undefined && el.tagName !== 'LABEL') {
      el.placeholder = translated;
    } else {
      el.textContent = translated;
    }
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', t(key));
  });
}
