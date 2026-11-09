/* mf-theme · tema chiaro/scuro condiviso con https://mattemn97.github.io
   Va caricato nel <head>: applica subito il tema salvato per evitare il flash. */
(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('theme');
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) {}

  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#mfTheme')) return;
    var current = root.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (err) {}
  });
})();
