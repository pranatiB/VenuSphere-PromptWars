/**
 * cache-purge.js
 * Forcefully purges the Service Worker and Cache Storage if the version mismatch is detected.
 * This ensures users always have the latest logic in a production environment.
 */
(function() {
  const CURRENT_VER = 'VENUSPHERE_2026_FINAL';
  if (localStorage.getItem('vf_pwa_version') !== CURRENT_VER) {
    console.log('[VenuSphere] New version detected (' + CURRENT_VER + '). Purging caches...');
    
    // 1. Unregister all service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }

    // 2. Clear all cache storage
    if ('caches' in window) {
      caches.keys().then(names => {
        for (let name of names) caches.delete(name);
      });
    }

    // 3. Mark as updated and hard reload
    localStorage.setItem('vf_pwa_version', CURRENT_VER);
    
    // Give it a tiny moment to unregister before reloading
    setTimeout(() => {
      window.location.reload(true);
    }, 500);
  }
})();
