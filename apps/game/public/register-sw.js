(function () {
  if (!('serviceWorker' in navigator)) return;
  if (new URLSearchParams(location.search).has('no-sw')) return;
  window.addEventListener('load', function () {
    var manifest = document.querySelector('link[rel="manifest"]');
    var base = manifest && manifest.href ? new URL('.', manifest.href).pathname : '/';
    navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(function () {
      // Offline play is best-effort; the game remains fully playable online.
    });
  });
})();
