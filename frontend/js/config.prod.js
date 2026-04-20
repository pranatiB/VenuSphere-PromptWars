/**
 * config.prod.js
 * Production runtime configuration.
 *
 * IMPORTANT:
 * - Do not commit live secrets/keys to source control.
 * - Replace REPLACE_* placeholders during deployment.
 */
window.VENUSPHERE_MAPS_KEY = "REPLACE_MAPS_API_KEY";
window.RECAPTCHA_SITE_KEY = "REPLACE_RECAPTCHA_SITE_KEY";

window.FIREBASE_CONFIG = {
  apiKey: "REPLACE_FIREBASE_API_KEY",
  authDomain: "REPLACE_FIREBASE_AUTH_DOMAIN",
  projectId: "REPLACE_FIREBASE_PROJECT_ID",
  storageBucket: "REPLACE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "REPLACE_FIREBASE_APP_ID",
  measurementId: "REPLACE_FIREBASE_MEASUREMENT_ID"
};
