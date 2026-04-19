/**
 * i18n.js
 * Lightweight internationalisation: loads locale JSON, translates [data-i18n] elements.
 */

import { getIdToken } from '/js/services/firebase-client.js';

/** @type {{ [key: string]: string }} */
let _translations = {};
let _currentLocale = 'en';
const _dynamicCache = new Map();

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
 * Call the translation REST API.
 */
export async function translateWithGoogle(text, targetLang) {
  if (targetLang === 'en' || !text) return text;
  
  const cacheKey = `${targetLang}_${text}`;
  if (_dynamicCache.has(cacheKey)) return _dynamicCache.get(cacheKey);

  try {
    const token = await getIdToken();
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({ text, target_lang: targetLang })
    });
    if (res.ok) {
      const data = await res.json();
      _dynamicCache.set(cacheKey, data.text);
      return data.text;
    }
  } catch(e) {
    console.warn("Dynamic translation failed:", e);
  }
  return text;
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
