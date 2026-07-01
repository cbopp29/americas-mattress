import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Register the service worker so the app loads offline (drivers lose signal in
// some delivery areas). CRITICAL: it must also auto-update so home-screen users
// never get stuck on a stale version. We check for a new build on every launch
// and hourly, and when one installs we reload the page so everyone always runs
// the latest code (including tracking fixes). Safe no-op where SW isn't supported.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // updateViaCache:'none' -> the browser always fetches a fresh sw.js so it can
    // detect new deploys instead of serving a cached (stale) worker.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      // Check for a newer build now and once an hour while the app stays open.
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // A new version finished installing AND an old one was already in
          // control -> this is an update. Reload once to switch to fresh code.
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
    }).catch(() => {});

    // Also re-check for updates whenever the app is brought back to the front
    // (home-screen apps are resumed, not reloaded, so this catches new builds).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => reg.update().catch(() => {})).catch(() => {});
      }
    });
  });
}
