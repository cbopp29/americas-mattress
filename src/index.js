import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Service worker REMOVED — it caused stale content and constant refreshing on
// home-screen (PWA) installs. Proactively unregister any worker a device still
// has and clear old caches so every phone self-heals back to the reliable
// always-online app. No re-registration, no reloads — nothing that can loop.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
}
if (window.caches && caches.keys) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}
