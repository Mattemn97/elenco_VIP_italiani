# 🌍 Elenco Regionale VIP Italiani con Classifica

Una dashboard interattiva, serverless e auto-aggiornante che analizza la popolarità dei personaggi famosi italiani in base al loro luogo di nascita (Regione o Provincia). L'applicazione incrocia in tempo reale i dati geografici e biografici di **Wikidata** con le statistiche di visualizzazione delle pagine di **Wikipedia Italia**.

## ✨ Funzionalità Principali

* **Sincronizzazione Automatica:** All'avvio, l'app interroga Wikidata per mappare dinamicamente tutte le 20 Regioni (incluse quelle a Statuto Speciale) e le 107 Province/Città Metropolitane italiane.
* **Data Mining Dinamico:** Estrae in tempo reale i personaggi nati all'interno dei confini selezionati elaborando i dati tramite query SPARQL.
* **Tripla Metrica di Valutazione:**
  * 🌍 **Fama Globale:** Numero di lingue in cui la pagina Wikipedia del VIP è stata tradotta.
  * 🔥 **Popolarità Attuale:** Visualizzazioni totali su it.wikipedia.org negli ultimi 365 giorni.
  * 🏛️ **Storico Totale:** Visualizzazioni totali dall'inizio del tracciamento ufficiale API di Wikipedia (Luglio 2015 a oggi).
* **Smart Caching:** I dati scaricati vengono salvati nella memoria del browser. Navigare tra territori già elaborati è istantaneo e non consuma chiamate API.
* **Design Responsive:** Interfaccia fluida e mobile-friendly con tema chiaro/scuro, nello stesso stile del sito [mattemn97.github.io](https://mattemn97.github.io/).

## 📂 Struttura del Progetto

Il codice è stato modularizzato per garantire la massima manutenibilità:

```text
/
├── index.html        # Struttura della dashboard e layout principale
├── css/
│   ├── mf-theme.css  # Tema condiviso con il sito personale
│   └── style.css     # Stili specifici della dashboard
└── js/
    ├── mf-theme.js   # Tema chiaro/scuro condiviso
    └── main.js       # Logica applicativa, chiamate API e gestione della UI
```

## 🛠️ Stack Tecnologico
Il progetto è una Single-Page Application (SPA) puramente Client-Side. Non richiede database o server backend proprietari.

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+).
- **Interfaccia**: HTML e CSS puri con il tema condiviso `mf-theme` (nessun framework esterno).
- **Data Source 1 (Geografia e Biografie)**: Wikidata Query Service (SPARQL).
- **Data Source 2 (Traffico)**: Wikimedia REST API (Pageviews).

Nota: è richiesta una connessione internet attiva per permettere il fetch dei dati dalle API di Wikipedia e Wikidata.

## ⚙️ Come funziona l'Algoritmo (Sotto il cofano)
Boot Sequence: La pagina invia query SPARQL per mappare i Q-ID (identificativi univoci di Wikidata) di regioni e province italiane.
- **Estrazione Candidati**: Selezionando un territorio (es. Q1239 per la Toscana), una query SPARQL cerca elementi umani (Q5) nati (P19) all'interno dell'albero geografico del territorio (P131*). I risultati sono pre-ordinati in base ai "sitelinks" (traduzioni globali).
- **Calcolo Metriche**: Il codice interroga in parallelo (Promise.all) l'endpoint /metrics/pageviews di Wikimedia. Per rispettare le policy anti-DDoS (Rate Limiting) di Wikipedia, è stata implementata una micro-pausa asincrona tra l'analisi di un VIP e il successivo.

## ⚠️ Limitazioni Note
- **Data di inizio storico**: Le API ufficiali di Wikimedia forniscono dati standardizzati e affidabili solo a partire dal Luglio 2015.
- **Rate Limiting**: Un utilizzo compulsivo dello strumento potrebbe far scattare i limiti di richieste temporanee (HTTP 429 Too Many Requests) imposti dai server Wikimedia.
