/* mf-log · log in console condivisi dai siti di Matteo Filippini
   ----------------------------------------------------------------
   Va caricato per primo nel <head>. Fa tre cose:
   1. espone MFLog.debug/info/warn/error(area, messaggio, dati) con orario e app;
   2. registra da solo: errori JS, promise rifiutate, file che non si caricano,
      ogni fetch (stato, durata, richieste lente o bloccate), blocchi del thread
      principale (la pagina "si impalla"), passaggi online/offline;
   3. tiene in memoria gli ultimi 500 eventi: in console MFLog.dump() li mostra
      in tabella e MFLog.download() li salva in un file .json da allegare.
   I messaggi "debug" si vedono attivando il livello "Verbose" della console,
   oppure aprendo la pagina con ?debug=1 (resta attivo finché non metti ?debug=0). */
(function () {
  'use strict';
  if (window.MFLog) return;

  var script = document.currentScript;
  var APP = (script && script.dataset.app) || location.pathname.split('/').filter(Boolean)[0] || 'sito';
  var T0 = performance.now();
  var SLOW_FETCH_MS = 8000;   // dopo quanto una richiesta è "lenta"
  var LONG_TASK_MS = 300;     // blocco del thread principale da segnalare
  var MAX_BUFFER = 500;
  var buffer = [];
  var seq = 0;

  var verbose = false;
  try {
    var q = new URLSearchParams(location.search).get('debug');
    if (q === '1') localStorage.setItem('mf-debug', '1');
    if (q === '0') localStorage.removeItem('mf-debug');
    verbose = localStorage.getItem('mf-debug') === '1';
  } catch (e) { /* storage non disponibile */ }

  var COLORS = { debug: '#8b8fa8', info: '#6d4dff', warn: '#e0a100', error: '#e5484d' };
  var native = {
    debug: console.debug.bind(console), info: console.info.bind(console),
    warn: console.warn.bind(console), error: console.error.bind(console)
  };

  function elapsed() { return ((performance.now() - T0) / 1000).toFixed(2) + 's'; }
  function clock() { var d = new Date(); return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0'); }

  function write(level, area, msg, data) {
    var entry = { n: ++seq, ora: clock(), t: elapsed(), livello: level, area: area, msg: msg };
    if (data !== undefined) entry.dati = data;
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    if (level === 'debug' && !verbose) {
      // resta comunque visibile con il filtro "Verbose" della console
      native.debug('[' + APP + '] ' + entry.t + ' [' + area + '] ' + msg, data === undefined ? '' : data);
      return;
    }
    var fn = level === 'debug' ? native.info : native[level];
    var head = '%c' + APP + '%c ' + entry.ora + ' +' + entry.t + ' %c' + area + '%c ' + msg;
    var args = [head,
      'background:' + COLORS[level] + ';color:#fff;border-radius:3px;padding:0 4px;font-weight:600',
      'color:#8b8fa8', 'color:' + COLORS[level] + ';font-weight:600', 'color:inherit'];
    if (data !== undefined) args.push(data);
    fn.apply(console, args);
  }

  var MFLog = {
    app: APP,
    debug: function (area, msg, data) { write('debug', area, msg, data); },
    info: function (area, msg, data) { write('info', area, msg, data); },
    warn: function (area, msg, data) { write('warn', area, msg, data); },
    error: function (area, msg, data) { write('error', area, msg, data); },
    // misura una fase: var fine = MFLog.time('area', 'cosa'); ... fine({extra})
    time: function (area, what) {
      var start = performance.now();
      write('debug', area, what + ' → inizio');
      return function (extra) {
        var ms = Math.round(performance.now() - start);
        write(ms > 3000 ? 'warn' : 'info', area, what + ' completato in ' + ms + ' ms', extra);
        return ms;
      };
    },
    dump: function () { console.table(buffer); return buffer.length + ' eventi'; },
    download: function () {
      var blob = new Blob([JSON.stringify({ app: APP, url: location.href, browser: navigator.userAgent, eventi: buffer }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'log-' + APP + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    },
    setVerbose: function (on) {
      verbose = !!on;
      try { on ? localStorage.setItem('mf-debug', '1') : localStorage.removeItem('mf-debug'); } catch (e) {}
      return 'debug ' + (verbose ? 'attivo' : 'disattivo');
    }
  };
  window.MFLog = MFLog;

  /* ---------- Errori non gestiti ---------- */
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) {
      write('error', 'risorse', 'Impossibile caricare <' + t.tagName.toLowerCase() + '>', t.src || t.href);
      return;
    }
    write('error', 'js', e.message || 'Errore JavaScript', {
      file: e.filename, riga: e.lineno, colonna: e.colno, stack: e.error && e.error.stack
    });
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    write('error', 'promise', 'Promise rifiutata senza gestione: ' + (r && r.message ? r.message : String(r)), r && r.stack);
  });

  /* ---------- Richieste di rete ---------- */
  if (window.fetch) {
    var origFetch = window.fetch.bind(window);
    var reqId = 0;
    window.fetch = function (input, init) {
      var id = ++reqId;
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var short = url.length > 140 ? url.slice(0, 137) + '…' : url;
      var start = performance.now();
      write('debug', 'rete', '#' + id + ' → ' + ((init && init.method) || 'GET') + ' ' + short);
      var waited = 0;
      var watchdog = setInterval(function () {
        waited += SLOW_FETCH_MS;
        write('warn', 'rete', '#' + id + ' ancora in attesa dopo ' + waited / 1000 + ' s (possibile blocco)', short);
      }, SLOW_FETCH_MS);
      return origFetch(input, init).then(function (res) {
        clearInterval(watchdog);
        var ms = Math.round(performance.now() - start);
        var info = { stato: res.status, ms: ms, url: short };
        var rl = res.headers && res.headers.get('x-ratelimit-remaining');
        if (rl !== null && rl !== undefined) info.rateLimitRimanenti = rl;
        if (!res.ok) {
          if (res.status === 403 || res.status === 429) {
            var reset = res.headers.get('x-ratelimit-reset') || res.headers.get('retry-after');
            info.limiteRichieste = true;
            if (reset) info.riprovaDopo = reset;
          }
          write(res.status >= 500 ? 'error' : 'warn', 'rete', '#' + id + ' risposta ' + res.status + ' ' + (res.statusText || ''), info);
        } else {
          write(ms > SLOW_FETCH_MS ? 'warn' : 'debug', 'rete', '#' + id + ' ← ' + res.status + ' in ' + ms + ' ms', info);
        }
        return res;
      }, function (err) {
        clearInterval(watchdog);
        write('error', 'rete', '#' + id + ' fallita dopo ' + Math.round(performance.now() - start) + ' ms: ' + (err && err.message), short);
        throw err;
      });
    };
  }

  /* ---------- Blocchi del thread principale ---------- */
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) {
        if (e.duration >= LONG_TASK_MS) {
          write('warn', 'prestazioni', 'Pagina bloccata per ' + Math.round(e.duration) + ' ms (calcolo lungo sul thread principale)');
        }
      });
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) { /* browser senza longtask API */ }

  /* ---------- Ciclo di vita della pagina ---------- */
  write('info', 'avvio', 'Log attivo · ' + location.href + (verbose ? ' · debug ON' : ' · per i dettagli: ?debug=1 o MFLog.setVerbose(true)'));
  document.addEventListener('DOMContentLoaded', function () { write('debug', 'avvio', 'DOM pronto'); });
  window.addEventListener('load', function () {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    write('info', 'avvio', 'Pagina caricata', nav ? { ms: Math.round(nav.duration), dimensioneKB: Math.round((nav.transferSize || 0) / 1024) } : undefined);
  });
  window.addEventListener('offline', function () { write('warn', 'rete', 'Connessione persa (offline)'); });
  window.addEventListener('online', function () { write('info', 'rete', 'Connessione tornata (online)'); });
  document.addEventListener('visibilitychange', function () { write('debug', 'pagina', document.hidden ? 'scheda nascosta' : 'scheda visibile'); });
})();
