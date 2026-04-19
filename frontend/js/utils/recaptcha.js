/**
 * recaptcha.js
 * Lazy-loads the Google reCAPTCHA v3 script and generates execution tokens.
 */

let _scriptLoadPromise = null;
let _isLoaded = false;

/**
 * Lazy-load the reCAPTCHA script only when requested.
 * @returns {Promise<void>}
 */
function loadRecaptcha() {
  if (_isLoaded) return Promise.resolve();
  if (_scriptLoadPromise) return _scriptLoadPromise;

  const siteKey = window.RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    console.warn('RECAPTCHA_SITE_KEY missing: reCAPTCHA disabled in UI.');
    _isLoaded = true;
    return Promise.resolve();
  }

  _scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      _isLoaded = true;
      window.grecaptcha.ready(() => resolve());
    };
    script.onerror = () => {
      console.error('Failed to load reCAPTCHA script.');
      reject(new Error('reCAPTCHA load failed'));
    };
    document.head.appendChild(script);
  });

  return _scriptLoadPromise;
}

/**
 * Get a reCAPTCHA v3 token for a specific action.
 * @param {string} action - The action name to verify on the backend.
 * @returns {Promise<string>} The token, or an empty string if disabled/failed.
 */
export async function getRecaptchaToken(action) {
  try {
    const siteKey = window.RECAPTCHA_SITE_KEY;
    if (!siteKey) return ""; // Dev mode bypass
    
    await loadRecaptcha();
    if (window.grecaptcha && window.grecaptcha.execute) {
      const token = await window.grecaptcha.execute(siteKey, { action });
      return token;
    }
  } catch (err) {
    console.warn('reCAPTCHA execution failed:', err);
  }
  return ""; // Soft fail
}
