let regioniDynamic = [];
let provinceDynamic = [];
const datiCache = {};
let ricercaCorrente = 0; // per ignorare i risultati di ricerche superate da un clic più recente

// logger condiviso (js/mf-log.js); se manca, i log vengono ignorati
const noop = () => {};
const log = window.MFLog || { debug: noop, info: noop, warn: noop, error: noop, time: () => noop };

// fetch + JSON con controllo dello stato: Wikidata in caso di limite o timeout risponde con HTML
async function fetchJson(url, area, cosa) {
    const res = await fetch(url);
    if (!res.ok) {
        const retry = res.headers.get('retry-after');
        throw new Error(`${cosa}: HTTP ${res.status}` +
            (res.status === 429 ? ` (troppe richieste${retry ? ', riprova tra ' + retry + ' s' : ''})` : '') +
            (res.status === 500 || res.status === 504 ? ' (query troppo pesante, timeout di Wikidata)' : ''));
    }
    try {
        return await res.json();
    } catch (e) {
        throw new Error(`${cosa}: risposta non in formato JSON (${e.message})`);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const endBoot = log.time('avvio', 'Sincronizzazione territori con Wikidata');
    try {
        await caricaTerritoriDaWikidata();
        costruisciInterfaccia();
        endBoot({ regioni: regioniDynamic.length, province: provinceDynamic.length });
        if (regioniDynamic.length !== 20) log.warn('avvio', `Attese 20 regioni, ricevute ${regioniDynamic.length}: controlla la query`);
        document.getElementById('boot-screen').style.display = 'none';
    } catch (error) {
        log.error('avvio', 'Territori non caricati, l\'app resta sulla schermata iniziale: ' + error.message, error.stack);
        document.getElementById('boot-screen').innerHTML = `
            <h2>Errore di sincronizzazione</h2>
            <p class="muted">Impossibile comunicare con Wikidata. Riprova tra poco.</p>
            <button class="mf-btn mf-btn-primary" onclick="location.reload()"><i class="fa-solid fa-rotate"></i> Ricarica</button>`;
    }
});

async function caricaTerritoriDaWikidata() {
    const queryRegioni = `
        SELECT ?item ?itemLabel WHERE {
            { ?item wdt:P31 wd:Q16110. } UNION 
            { ?item wdt:P31 wd:Q1710033. }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
        }`;

    const queryProvince = `
        SELECT ?item ?itemLabel WHERE {
            { ?item wdt:P31 wd:Q15089. } UNION 
            { ?item wdt:P31 wd:Q15110. } UNION
            { ?item wdt:P31 wd:Q16512686. }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
        }`;

    const [dataRegioni, dataProvince] = await Promise.all([
        fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(queryRegioni)}&format=json`, 'avvio', 'Elenco regioni'),
        fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(queryProvince)}&format=json`, 'avvio', 'Elenco province')
    ]);

    regioniDynamic = dataRegioni.results.bindings.map(b => {
        let nomePulito = b.itemLabel.value
            .replace(/^Regione Autonoma /i, '')
            .replace(/^Regione /i, '')
            .trim();
        return { qid: b.item.value.split('/').pop(), nome: nomePulito };
    }).sort((a, b) => a.nome.localeCompare(b.nome));

    provinceDynamic = dataProvince.results.bindings.map(b => {
        let nomePulito = b.itemLabel.value
            .replace(/^Provincia autonoma di /i, '')
            .replace(/^Provincia di /i, '')
            .replace(/^Città metropolitana di /i, '')
            .replace(/^Libero consorzio comunale di /i, '')
            .trim();
        return { qid: b.item.value.split('/').pop(), nome: nomePulito };
    }).sort((a, b) => a.nome.localeCompare(b.nome));
}

function costruisciInterfaccia() {
    const tabBar = document.getElementById("main-tabs");

    regioniDynamic.forEach(regione => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mf-chip tab-link";
        btn.innerText = regione.nome;
        btn.onclick = (e) => loadDataView(e, regione.nome, regione.qid, "Regione");
        tabBar.appendChild(btn);
    });

    const selectProvincia = document.getElementById("select-provincia");
    provinceDynamic.forEach(prov => {
        const opt = document.createElement("option");
        opt.value = prov.qid;
        opt.innerText = prov.nome;
        selectProvincia.appendChild(opt);
    });
    document.getElementById("count-province").innerText = provinceDynamic.length;
}

function setMode(mode) {
    document.getElementById("btn-mode-regione").classList.toggle("active", mode === "Regione");
    document.getElementById("btn-tab-provincia").classList.toggle("active", mode === "Provincia");
    document.getElementById("main-tabs").style.display = mode === "Regione" ? "" : "none";
    document.getElementById("barra-provincia").style.display = mode === "Provincia" ? "block" : "none";
    document.querySelector(".picker-head h2").innerHTML = mode === "Regione"
        ? '<i class="fa-solid fa-map"></i> Regioni'
        : '<i class="fa-solid fa-location-dot"></i> Province';
}

function openRegioneView() {
    setMode("Regione");
}

function openProvinciaView(evt) {
    document.querySelectorAll(".tab-link").forEach(btn => btn.classList.remove("active"));
    setMode("Provincia");
    document.getElementById("contenitore-tabelle").style.display = "none";
    document.getElementById("classifiche-messaggio").style.display = "block";
    document.getElementById("titolo-classifica").innerText = "Ricerca VIP per Provincia";
    document.getElementById("avviso-stato").style.display = "none";
}

function avviaRicercaProvincia() {
    const select = document.getElementById("select-provincia");
    if (!select.value) { log.debug('ricerca', 'Cerca VIP premuto senza scegliere una provincia'); return; }
    const nomeProvincia = select.options[select.selectedIndex].text;
    const qidProvincia = select.value;
    loadDataView({currentTarget: document.getElementById("btn-tab-provincia")}, nomeProvincia, qidProvincia, "Provincia");
}

async function loadDataView(evt, targetName, targetQID, typeLabel) {
    if (typeLabel === "Regione") {
        document.querySelectorAll(".tab-link").forEach(btn => btn.classList.remove("active"));
        if (evt && evt.currentTarget) evt.currentTarget.classList.add("active");
    }

    document.getElementById("titolo-classifica").innerText = `Analisi VIP: ${targetName} (${typeLabel})`;
    document.getElementById("classifiche-messaggio").style.display = 'none';
    
    const avvisoStato = document.getElementById('avviso-stato');
    const contenitoreTabelle = document.getElementById('contenitore-tabelle');

    const mio = ++ricercaCorrente;
    if (datiCache[targetQID]) {
        log.info('ricerca', `${targetName} (${targetQID}) già in memoria, nessuna richiesta`);
        avvisoStato.style.display = 'none';
        disegnaTabelle(datiCache[targetQID]);
        contenitoreTabelle.style.display = '';
        return;
    }

    contenitoreTabelle.style.display = 'none';
    avvisoStato.style.display = 'block';
    avvisoStato.firstElementChild.className = "mf-alert warn";
    document.getElementById('testo-avviso').innerHTML = `<span class="mf-spinner"></span> Estrazione dati per <b>${targetName}</b>… può richiedere qualche secondo.`;

    log.info('ricerca', `Avvio analisi di ${targetName} (${typeLabel}, ${targetQID})`);
    const endRicerca = log.time('ricerca', `Analisi ${targetName}`);
    try {
        const datiCalcolati = await eseguiRicercaDati(targetQID);
        datiCache[targetQID] = datiCalcolati;
        endRicerca({ topLingue: datiCalcolati.traduzioni.map(v => v.name) });
        if (mio !== ricercaCorrente) {
            // l'utente ha già cliccato un altro territorio: non sovrascrivere la vista
            log.info('ricerca', `Risultati di ${targetName} arrivati ma superati da un'altra ricerca: salvati in memoria, non mostrati`);
            return;
        }

        avvisoStato.firstElementChild.className = "mf-alert ok";
        document.getElementById('testo-avviso').innerHTML = `<i class="fa-solid fa-circle-check"></i> Dati elaborati per <b>${targetName}</b>.`;

        disegnaTabelle(datiCalcolati);
        contenitoreTabelle.style.display = '';

    } catch (error) {
        log.error('ricerca', `Analisi di ${targetName} fallita: ${error.message}`, error.stack);
        if (mio !== ricercaCorrente) return;
        avvisoStato.firstElementChild.className = "mf-alert err";
        document.getElementById('testo-avviso').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Errore durante il calcolo: probabilmente è stato raggiunto il limite di richieste alle API. Riprova tra poco.';
    }
}

function getDailyDates1Year() {
    const past = new Date(); past.setFullYear(new Date().getFullYear() - 1);
    const format = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return { start: format(past), end: format(new Date()) };
}

function getMonthlyDatesAllTime() {
    const today = new Date();
    return { start: "2015070100", end: today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + "0100" };
}

async function getWikipediaViews(wikiTitle, granularity, dates) {
    try {
        const res = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/it.wikipedia.org/all-access/user/${encodeURIComponent(wikiTitle)}/${granularity}/${dates.start}/${dates.end}`);
        if (!res.ok) {
            // 404 = pagina senza statistiche nel periodo; 429 = troppe richieste
            log.warn('visite', `"${wikiTitle}" (${granularity}): HTTP ${res.status}, conto 0 visite`);
            return 0;
        }
        const data = await res.json();
        return data.items.reduce((sum, item) => sum + item.views, 0);
    } catch (e) {
        log.warn('visite', `"${wikiTitle}" (${granularity}): ${e.message}, conto 0 visite`);
        return 0;
    }
}

async function eseguiRicercaDati(targetQID) {
    const sparqlQuery = `
        SELECT ?personLabel ?sitelinks ?article WHERE {
            ?person wdt:P31 wd:Q5; wdt:P19 ?place. 
            ?place wdt:P131* wd:${targetQID}. 
            ?person wikibase:sitelinks ?sitelinks.
            ?article schema:about ?person; schema:isPartOf <https://it.wikipedia.org/>.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "it". }
        } ORDER BY DESC(?sitelinks) LIMIT 15`;

    // la query più lenta: per le regioni grandi Wikidata può impiegare decine di secondi
    const endSparql = log.time('ricerca', `Query SPARQL persone nate in ${targetQID}`);
    const candidates = (await fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`, 'ricerca', 'Query VIP')).results.bindings;
    endSparql({ candidati: candidates.length });
    if (!candidates.length) log.warn('ricerca', `Nessuna persona trovata per ${targetQID}`);
    const endViews = log.time('visite', `Visite Wikipedia di ${candidates.length} persone (${candidates.length * 2} richieste)`);

    const topTraduzioni = candidates.slice(0, 5).map(c => ({
        name: c.personLabel.value, url: c.article.value, valore: parseInt(c.sitelinks.value)
    }));

    let arrAnno = [], arrStoriche = [];
    const d1Year = getDailyDates1Year(), dAllTime = getMonthlyDatesAllTime();

    for (const [i, c] of candidates.entries()) {
        const wikiTitle = decodeURIComponent(c.article.value.split('/wiki/')[1]);
        const [vAnno, vStoriche] = await Promise.all([
            getWikipediaViews(wikiTitle, 'daily', d1Year),
            getWikipediaViews(wikiTitle, 'monthly', dAllTime)
        ]);
        log.debug('visite', `${i + 1}/${candidates.length} ${c.personLabel.value}: ${vAnno} nell'ultimo anno, ${vStoriche} dal 2015`);
        arrAnno.push({ name: c.personLabel.value, url: c.article.value, valore: vAnno });
        arrStoriche.push({ name: c.personLabel.value, url: c.article.value, valore: vStoriche });
        await new Promise(r => setTimeout(r, 150));
    }
    endViews();

    return { 
        traduzioni: topTraduzioni, 
        visiteAnno: arrAnno.sort((a, b) => b.valore - a.valore).slice(0, 5), 
        visiteStoriche: arrStoriche.sort((a, b) => b.valore - a.valore).slice(0, 5) 
    };
}

function disegnaTabelle(dati) {
    compilaTabella('tabella-traduzioni-body', dati.traduzioni, true);
    compilaTabella('tabella-visite-anno-body', dati.visiteAnno, false);
    compilaTabella('tabella-visite-storiche-body', dati.visiteStoriche, false);
}

function compilaTabella(bodyId, arrayDati, isTraduzioni) {
    const tbody = document.getElementById(bodyId);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const max = Math.max(1, ...arrayDati.map(v => v.valore));
    tbody.innerHTML = arrayDati.map((vip, i) => {
        const pos = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="posizione-normale">${i + 1}°</span>`;
        const val = isTraduzioni ? `${vip.valore} lingue` : vip.valore.toLocaleString('it-IT');
        const nome = vip.url
            ? `<a class="vip-name" href="${esc(vip.url)}" target="_blank" rel="noopener">${esc(vip.name)}</a>`
            : `<span class="vip-name">${esc(vip.name)}</span>`;
        return `<tr>
            <td class="pos"><span class="medaglia">${pos}</span></td>
            <td>${nome}<div class="bar" style="width:${Math.round(vip.valore / max * 100)}%"></div></td>
            <td class="val">${val}</td>
        </tr>`;
    }).join('');
}
