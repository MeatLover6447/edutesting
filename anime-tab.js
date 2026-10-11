/* anime-tab.js
 * ---------------------------------------------------------------------------
 * Adds an "Anime" tab (right after Guides) to the grades/attendance site.
 *
 * This is a pure AniList browser:
 *   - Trending grid loads on open
 *   - Search by title
 *   - Click a cover to select it, pick an episode, pick SUB/DUB
 *   - "Search on [site]" opens a proxy/anime site in a new tab with the
 *     title pre-filled (or just the homepage, depending on what the site
 *     supports)
 *
 * Why no in-page player and no ani.pm deep links:
 *   ani.pm's player is served from embed.settlar.io with a strict
 *   frame-ancestors allow-list (ani.pm, ani.nz, next.ani.pm, ...). It only
 *   renders inside an iframe on one of those origins. The /embed/ URLs 404
 *   when loaded as a top-level page, and there's no public watch URL. So
 *   ani.pm can't be embedded or deep-linked from here — the tab browses
 *   AniList and hands off to whatever site you actually use to watch.
 *
 * SETUP:
 *   Add this right before </body> in index.html:
 *          <script src="anime-tab.js" defer></script>
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* =========================================================================
     CONFIG — where to send the user when they hit "Search on ..."
     Add or remove entries freely. `search` is optional:
       - if provided, it builds a URL that includes the title
       - if omitted, it just opens the site's homepage
     ========================================================================= */
  var WATCH_SITES = {
    truffled: {
      label: 'Truffled',
      home: 'https://truffled.cv/',
      // Truffled doesn't document a search-URL format; opens homepage.
    },
    dogeub: {
      label: 'DogeUB',
      home: 'https://edu.ronginbari.com/',
    },
    interstellar: {
      label: 'Interstellar',
      home: 'https://79625.d-n-s.org.uk/',
    },
    mizumath: {
      label: 'Mizumath',
      home: 'https://ongoingeducation.online/',
    },
    korona: {
      label: 'Korona',
      home: 'https://korona.thewhitedoveschools.org/',
    },
    selenite: {
      label: 'Selenite',
      home: 'https://gospel.newcovenant-teaching.org/',
    },
    movy: {
      label: 'Movy',
      home: 'https://www.movy.sx/',
    },
    rivestream: {
      label: 'Rivestream',
      home: 'https://www.rivestream.app',
    },
    corsflix: {
      label: 'CorsFlix',
      home: 'https://watch.corsflix.net/',
    },
  };

  var DEFAULT_SITE = 'truffled';

  /* =========================================================================
     CONSTANTS
     ========================================================================= */
  var ANILIST_API = 'https://graphql.anilist.co';
  var RESULT_LIMIT = 24;

  var QUERY_SEARCH = [
    'query ($search: String, $page: Int, $perPage: Int) {',
    '  Page(page: $page, perPage: $perPage) {',
    '    media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SCORE_DESC], isAdult: false) {',
    '      id',
    '      title { romaji english }',
    '      coverImage { medium large }',
    '      episodes',
    '      format',
    '      seasonYear',
    '      averageScore',
    '    }',
    '  }',
    '}'
  ].join('\n');

  var QUERY_TRENDING = [
    'query ($page: Int, $perPage: Int) {',
    '  Page(page: $page, perPage: $perPage) {',
    '    media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {',
    '      id',
    '      title { romaji english }',
    '      coverImage { medium large }',
    '      episodes',
    '      format',
    '      seasonYear',
    '      averageScore',
    '    }',
    '  }',
    '}'
  ].join('\n');

  /* =========================================================================
     1. Styles
     ========================================================================= */
  var CSS = [
    '.anime-wrap { max-width: 1000px; margin: 0 auto; padding: 0 32px 120px; }',
    '.anime-wrap h1 { font-family: var(--serif); font-size: 32px; font-weight: 500; margin: 0 0 8px; }',
    '.anime-wrap .rule { height: 1px; background: var(--line); margin-bottom: 36px; }',

    '.anime-hint { font-size: 13.5px; color: var(--muted); margin: -20px 0 22px; line-height: 1.65; }',
    '.anime-hint a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent); }',
    '.anime-hint a:hover, .anime-hint a:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }',

    '.anime-search-wrap { position: relative; margin-bottom: 12px; }',
    '.anime-search { width: 100%; background: var(--accent-soft); border: 1px solid var(--line); color: var(--ink); font-family: var(--sans); font-size: 15px; padding: 13px 44px 13px 16px; border-radius: 8px; outline: none; transition: border-color 0.15s ease, background 0.15s ease; -webkit-appearance: none; }',
    '.anime-search::placeholder { color: var(--muted); }',
    '.anime-search:focus { border-color: var(--accent); background: #2E3328; }',
    '.anime-search-icon { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; font-size: 15px; }',
    '.anime-search-status { font-size: 12.5px; color: var(--muted); margin: 0 0 14px; min-height: 18px; letter-spacing: 0.02em; }',

    '.anime-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 14px 12px; margin-bottom: 34px; }',
    '.anime-results:empty { display: none; }',
    '.anime-card { display: flex; flex-direction: column; background: transparent; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; padding: 0; cursor: pointer; font-family: inherit; text-align: left; transition: transform 0.15s ease, border-color 0.15s ease; }',
    '.anime-card:hover, .anime-card:focus-visible { border-color: var(--accent); transform: translateY(-3px); outline: none; }',
    '.anime-card.active { border-color: var(--accent); background: var(--accent-soft); }',
    '.anime-card .cover { width: 100%; aspect-ratio: 2 / 3; background: var(--accent-soft); display: block; object-fit: cover; }',
    '.anime-card .cover-ph { width: 100%; aspect-ratio: 2 / 3; background: var(--accent-soft); display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 26px; color: var(--muted); }',
    '.anime-card .meta { padding: 7px 9px 9px; }',
    '.anime-card .t { font-size: 12px; line-height: 1.3; color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
    '.anime-card:hover .t, .anime-card:focus-visible .t { color: var(--accent); }',
    '.anime-card .s { font-size: 10.5px; color: var(--muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',

    '.anime-manual { border: 1px solid var(--line); border-radius: 8px; padding: 0 16px; margin-bottom: 26px; background: transparent; }',
    '.anime-manual > summary { cursor: pointer; list-style: none; font-size: 13.5px; color: var(--muted); padding: 12px 0; user-select: none; transition: color 0.15s ease; }',
    '.anime-manual > summary::-webkit-details-marker { display: none; }',
    '.anime-manual > summary::before { content: "\\203A"; display: inline-block; margin-right: 9px; transition: transform 0.15s ease; color: var(--accent); }',
    '.anime-manual[open] > summary::before { transform: rotate(90deg); }',
    '.anime-manual > summary:hover { color: var(--ink); }',

    '.anime-controls { display: grid; grid-template-columns: minmax(0, 1fr) 110px auto; gap: 12px; margin-bottom: 8px; align-items: end; }',
    '.anime-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }',
    '.anime-field label { font-size: 11.5px; color: var(--muted); letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; }',
    '.anime-input { background: var(--accent-soft); border: 1px solid var(--line); color: var(--ink); font-family: var(--sans); font-size: 15px; padding: 11px 14px; border-radius: 8px; outline: none; transition: border-color 0.15s ease, background 0.15s ease; -webkit-appearance: none; width: 100%; }',
    '.anime-input::placeholder { color: var(--muted); }',
    '.anime-input:focus { border-color: var(--accent); background: #2E3328; }',
    '.anime-input::-webkit-outer-spin-button, .anime-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }',
    '.anime-input[type="number"] { -moz-appearance: textfield; }',
    '.anime-load-btn { background: var(--accent-soft); border: 1px solid var(--accent); color: var(--accent); font-family: var(--serif); font-size: 15px; font-weight: 500; padding: 0 26px; height: 44px; border-radius: 8px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; white-space: nowrap; }',
    '.anime-load-btn:hover, .anime-load-btn:focus-visible { background: var(--accent); color: var(--paper); outline: none; }',

    '.anime-lang-block { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }',
    '.anime-lang-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; height: 38px; background: var(--accent-soft); flex-shrink: 0; }',
    '.anime-lang-toggle button { background: transparent; border: none; color: var(--muted); font-family: var(--sans); font-size: 12.5px; font-weight: 600; letter-spacing: 0.08em; padding: 0 18px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }',
    '.anime-lang-toggle button:hover { color: var(--ink); }',
    '.anime-lang-toggle button.active { background: var(--accent); color: var(--paper); }',
    '.anime-lang-note { font-size: 11px; color: var(--muted); line-height: 1.4; text-align: right; max-width: 240px; }',

    '.anime-nowbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 0 0 12px; min-height: 38px; flex-wrap: wrap; }',
    '.anime-picked { font-size: 14px; color: var(--muted); margin: 0; line-height: 1.5; flex: 1 1 auto; min-width: 0; padding-top: 8px; }',
    '.anime-picked b { color: var(--accent); font-weight: 500; }',

    '.anime-proxy-row { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; flex-wrap: wrap; }',
    '.anime-proxy-row label { font-size: 11.5px; color: var(--muted); letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; }',
    '.anime-proxy-select { background: var(--accent-soft); border: 1px solid var(--line); color: var(--ink); font-family: var(--sans); font-size: 13.5px; padding: 8px 12px; border-radius: 6px; outline: none; cursor: pointer; }',
    '.anime-proxy-select:focus { border-color: var(--accent); }',
    '.anime-open-btn { background: var(--accent); border: 1px solid var(--accent); color: var(--paper); font-family: var(--serif); font-size: 14.5px; font-weight: 500; padding: 0 22px; height: 38px; border-radius: 6px; cursor: pointer; transition: opacity 0.15s ease; white-space: nowrap; }',
    '.anime-open-btn:hover, .anime-open-btn:focus-visible { opacity: 0.85; outline: none; }',
    '.anime-open-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
    '.anime-open-btn.ghost { background: transparent; color: var(--accent); }',

    '.anime-episodes { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }',
    '.anime-episodes:empty { display: none; }',
    '.anime-ep-btn { background: var(--accent-soft); border: 1px solid var(--line); color: var(--muted); font-family: var(--sans); font-size: 12px; font-weight: 500; min-width: 36px; height: 30px; padding: 0 8px; border-radius: 6px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }',
    '.anime-ep-btn:hover, .anime-ep-btn:focus-visible { color: var(--ink); border-color: var(--accent); outline: none; }',
    '.anime-ep-btn.active { background: var(--accent); color: var(--paper); border-color: var(--accent); }',
    '.anime-ep-more { font-size: 12px; color: var(--muted); align-self: center; padding-left: 4px; }',

    '.anime-status { background: var(--accent-soft); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.7; color: #C9C5B6; height: 120px; overflow-y: auto; }',
    '.anime-status .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.anime-status .line b { color: var(--accent); font-weight: 500; }',
    '.anime-status .ts { color: #6B685D; margin-right: 10px; font-size: 11px; }',
    '.anime-status:empty::before { content: "log will appear here\\2026"; color: #6B685D; }',

    '@media (max-width: 760px) {',
    '  .anime-wrap { padding: 0 20px 80px; }',
    '  .anime-results { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 12px 10px; }',
    '  .anime-controls { grid-template-columns: 1fr 1fr; }',
    '  .anime-field.anime-field-wide { grid-column: 1 / -1; }',
    '  .anime-load-btn { grid-column: 1 / -1; }',
    '  .anime-nowbar { align-items: stretch; }',
    '  .anime-lang-block { align-items: stretch; }',
    '  .anime-lang-note { text-align: left; max-width: none; }',
    '}'
  ].join('\n');

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* =========================================================================
     2. Inject tab + panel
     ========================================================================= */
  function injectTabs() {
    if (document.getElementById('tab-anime')) return true;

    var tabs = document.querySelector('.tabs');
    var guidesBtn = tabs && tabs.querySelector('[data-tab="guides"]');
    var guidesPanel = document.getElementById('tab-guides');
    if (!tabs || !guidesBtn || !guidesPanel) return false;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.dataset.tab = 'anime';
    btn.setAttribute('role', 'tab');
    btn.textContent = 'Anime';
    guidesBtn.insertAdjacentElement('afterend', btn);

    var siteOpts = Object.keys(WATCH_SITES).map(function (k) {
      var sel = k === DEFAULT_SITE ? ' selected' : '';
      return '<option value="' + k + '"' + sel + '>' + escapeHtml(WATCH_SITES[k].label) + '</option>';
    }).join('');

    var panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = 'tab-anime';
    panel.innerHTML = [
      '<div class="anime-wrap">',
      '  <h1>anime</h1>',
      '  <div class="rule"></div>',
      '',
      '  <p class="anime-hint">',
      '    browse with <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">anilist</a>',
      '    &middot; when you find something, pick an episode and hit <b>Search on &hellip;</b> to open it on the site you actually watch on.',
      '  </p>',
      '',
      '  <div class="anime-search-wrap">',
      '    <input type="text" id="animeSearch" class="anime-search" placeholder="Search anime... (e.g. frieren, jujutsu kaisen)" autocomplete="off" spellcheck="false" aria-label="Search anime">',
      '    <span class="anime-search-icon">&#x1F50D;</span>',
      '  </div>',
      '  <p class="anime-search-status" id="animeSearchStatus"></p>',
      '',
      '  <div class="anime-results" id="animeResults" aria-live="polite"></div>',
      '',
      '  <details class="anime-manual">',
      '    <summary>or enter an id / url manually</summary>',
      '    <div class="anime-controls" style="margin-top: 12px;">',
      '      <div class="anime-field anime-field-wide">',
      '        <label for="animeIdInput">anilist / mal id or url</label>',
      '        <input type="text" id="animeIdInput" class="anime-input" placeholder="154587 &middot; mal-52991 &middot; https://anilist.co/anime/154587" autocomplete="off" spellcheck="false">',
      '      </div>',
      '      <div class="anime-field">',
      '        <label for="animeEpInput">episode</label>',
      '        <input type="number" id="animeEpInput" class="anime-input" value="1" min="1" step="1" inputmode="numeric">',
      '      </div>',
      '      <button type="button" id="animeLoadBtn" class="anime-load-btn">Select</button>',
      '    </div>',
      '  </details>',
      '',
      '  <div class="anime-nowbar">',
      '    <p class="anime-picked" id="animePicked">nothing selected yet &mdash; pick a cover above or enter an id manually.</p>',
      '    <div class="anime-lang-block">',
      '      <div class="anime-lang-toggle" role="group" aria-label="Language">',
      '        <button type="button" data-lang="sub" class="active" aria-pressed="true">SUB</button>',
      '        <button type="button" data-lang="dub" aria-pressed="false">DUB</button>',
      '      </div>',
      '      <div class="anime-lang-note">just a preference \u2014 the site you open decides what it has</div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="anime-episodes" id="animeEpisodes" role="group" aria-label="Episode"></div>',
      '',
      '  <div class="anime-proxy-row">',
      '    <label for="animeProxySelect">watch on</label>',
      '    <select id="animeProxySelect" class="anime-proxy-select">' + siteOpts + '</select>',
      '    <button type="button" id="animeOpenBtn" class="anime-open-btn" disabled>Search on site</button>',
      '    <button type="button" id="animeCopyBtn" class="anime-open-btn ghost" disabled>Copy title</button>',
      '  </div>',
      '',
      '  <div class="anime-status" id="animeStatus" aria-live="polite"></div>',
      '</div>'
    ].join('\n');
    guidesPanel.insertAdjacentElement('afterend', panel);

    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn[data-tab]').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      document.querySelectorAll('.tab-panel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'tab-anime');
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      initAnime();
    });

    return true;
  }

  /* =========================================================================
     3. State
     ========================================================================= */
  var initialized = false;
  var currentLang = 'sub';
  var currentAnime = null; // { id, title, episodes, currentEpisode }

  function log(html) {
    var statusEl = document.getElementById('animeStatus');
    if (!statusEl) return;
    var line = document.createElement('div');
    line.className = 'line';
    var ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.appendChild(ts);
    var msg = document.createElement('span');
    msg.innerHTML = html;
    line.appendChild(msg);
    statusEl.appendChild(line);
    statusEl.scrollTop = statusEl.scrollHeight;
    while (statusEl.children.length > 80) statusEl.removeChild(statusEl.firstChild);
  }

  function parseAnimeId(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    var m = s.match(/anilist\.co\/anime\/(\d+)/i);
    if (m) return m[1];
    m = s.match(/myanimelist\.net\/anime\/(\d+)/i);
    if (m) return 'mal-' + m[1];
    if (/^[1-9]\d{0,9}$/.test(s)) return s;
    if (/^mal-[1-9]\d{0,9}$/i.test(s)) return s.toLowerCase();
    return null;
  }

  /* =========================================================================
     4. AniList API
     ========================================================================= */
  function anilistRequest(query, variables) {
    return fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (res) {
      if (!res.ok) throw new Error('anilist http ' + res.status);
      return res.json();
    }).then(function (json) {
      if (json.errors && json.errors.length) {
        throw new Error(json.errors[0].message || 'anilist returned an error');
      }
      if (!json.data || !json.data.Page || !json.data.Page.media) return [];
      return json.data.Page.media;
    });
  }

  function searchAnime(q) {
    return anilistRequest(QUERY_SEARCH, { search: q, page: 1, perPage: RESULT_LIMIT });
  }

  function trendingAnime() {
    return anilistRequest(QUERY_TRENDING, { page: 1, perPage: RESULT_LIMIT });
  }

  /* =========================================================================
     5. UI helpers
     ========================================================================= */
  function setSearchStatus(text) {
    var el = document.getElementById('animeSearchStatus');
    if (el) el.textContent = text || '';
  }

  function displayTitle(m) {
    if (!m || !m.title) return 'untitled';
    return m.title.english || m.title.romaji || 'untitled';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderResults(list) {
    var grid = document.getElementById('animeResults');
    if (!grid) return;
    grid.innerHTML = '';

    list.forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'anime-card';
      btn.dataset.anilistId = String(m.id);
      if (currentAnime && String(currentAnime.id) === String(m.id)) btn.classList.add('active');

      var cover = m.coverImage && (m.coverImage.medium || m.coverImage.large);
      if (cover) {
        var img = document.createElement('img');
        img.className = 'cover';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = displayTitle(m);
        img.src = cover;
        btn.appendChild(img);
      } else {
        var ph = document.createElement('div');
        ph.className = 'cover-ph';
        ph.textContent = displayTitle(m).charAt(0).toUpperCase();
        btn.appendChild(ph);
      }

      var meta = document.createElement('div');
      meta.className = 'meta';

      var t = document.createElement('div');
      t.className = 't';
      t.textContent = displayTitle(m);
      meta.appendChild(t);

      var bits = [];
      if (m.seasonYear) bits.push(m.seasonYear);
      if (m.format) bits.push(String(m.format).replace(/_/g, ' ').toLowerCase());
      if (m.episodes) bits.push(m.episodes + ' ep');
      var s = document.createElement('div');
      s.className = 's';
      s.textContent = bits.join(' \u00b7 ');
      meta.appendChild(s);

      btn.appendChild(meta);
      grid.appendChild(btn);
    });
  }

  function renderPicked() {
    var el = document.getElementById('animePicked');
    if (!el) return;
    if (!currentAnime) {
      el.innerHTML = 'nothing selected yet &mdash; pick a cover above or enter an id manually.';
      updateOpenButton();
      return;
    }
    el.innerHTML = 'selected: <b>' + escapeHtml(currentAnime.title) + '</b> &middot; episode <b>' +
      escapeHtml(String(currentAnime.currentEpisode)) + '</b> &middot; ' +
      '<b>' + currentLang.toUpperCase() + '</b>';
    updateOpenButton();
  }

  function renderEpisodes() {
    var wrap = document.getElementById('animeEpisodes');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!currentAnime) return;

    var total = Number(currentAnime.episodes) || 0;
    var shown = total > 0 ? total : 24;
    var cap = Math.min(shown, 50);

    for (var i = 1; i <= cap; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'anime-ep-btn';
      b.dataset.episode = String(i);
      b.textContent = String(i);
      if (i === currentAnime.currentEpisode) b.classList.add('active');
      wrap.appendChild(b);
    }

    if (total > 50) {
      var more = document.createElement('span');
      more.className = 'anime-ep-more';
      more.textContent = '\u2026 ' + (total - 50) + ' more (use manual input)';
      wrap.appendChild(more);
    }
  }

  function updateOpenButton() {
    var b = document.getElementById('animeOpenBtn');
    var c = document.getElementById('animeCopyBtn');
    if (b) b.disabled = !currentAnime;
    if (c) c.disabled = !currentAnime;
  }

  function syncLangButtons() {
    document.querySelectorAll('.anime-lang-toggle button').forEach(function (b) {
      var on = b.dataset.lang === currentLang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* =========================================================================
     6. Open the chosen watch site
     ========================================================================= */
  function openWatchSite() {
    if (!currentAnime) {
      log('\u274C nothing selected yet');
      return;
    }
    var sel = document.getElementById('animeProxySelect');
    var key = sel && WATCH_SITES[sel.value] ? sel.value : DEFAULT_SITE;
    var site = WATCH_SITES[key];

    // If the site defines a search URL format, use it. Otherwise homepage.
    var url = site.home;
    if (typeof site.search === 'function') {
      url = site.search(currentAnime.title, currentAnime.currentEpisode, currentLang);
    }

    log('\u2197 opening <b>' + escapeHtml(site.label) + '</b> \u2014 search for <b>' +
        escapeHtml(currentAnime.title) + '</b> there');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function copyTitle() {
    if (!currentAnime) return;
    var text = currentAnime.title + (currentAnime.currentEpisode > 1 ? ' episode ' + currentAnime.currentEpisode : '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        log('\u{1F4CB} copied <b>' + escapeHtml(text) + '</b> \u2014 paste it into the site\'s search');
      }).catch(function () {
        log('\u{1F4CB} ' + escapeHtml(text));
      });
    } else {
      log('\u{1F4CB} ' + escapeHtml(text));
    }
  }

  /* =========================================================================
     7. Init
     ========================================================================= */
  function initAnime() {
    if (initialized) return;
    initialized = true;

    var searchInput = document.getElementById('animeSearch');
    var resultsGrid = document.getElementById('animeResults');
    var idInput = document.getElementById('animeIdInput');
    var epInput = document.getElementById('animeEpInput');
    var loadBtn = document.getElementById('animeLoadBtn');
    var langBtns = document.querySelectorAll('.anime-lang-toggle button');
    var episodesWrap = document.getElementById('animeEpisodes');
    var openBtn = document.getElementById('animeOpenBtn');
    var copyBtn = document.getElementById('animeCopyBtn');

    /* ---- trending on open ---- */
    setSearchStatus('loading trending\u2026');
    trendingAnime().then(function (list) {
      renderResults(list);
      setSearchStatus(list.length ? 'trending now' : 'no results');
    }).catch(function (err) {
      setSearchStatus('could not load trending (' + (err && err.message ? err.message : err) + ')');
    });

    /* ---- search with debounce ---- */
    var debounceTimer = null;
    var searchSeq = 0;
    function doSearch(q) {
      var seq = ++searchSeq;
      setSearchStatus('searching\u2026');
      searchAnime(q).then(function (list) {
        if (seq !== searchSeq) return;
        renderResults(list);
        setSearchStatus(list.length ? list.length + ' result' + (list.length === 1 ? '' : 's') : 'no results for "' + q + '"');
      }).catch(function (err) {
        if (seq !== searchSeq) return;
        setSearchStatus('search failed (' + (err && err.message ? err.message : err) + ')');
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var q = searchInput.value.trim();
        clearTimeout(debounceTimer);
        if (!q) {
          debounceTimer = setTimeout(function () {
            setSearchStatus('loading trending\u2026');
            trendingAnime().then(function (list) {
              renderResults(list);
              setSearchStatus('trending now');
            }).catch(function () { setSearchStatus(''); });
          }, 250);
          return;
        }
        debounceTimer = setTimeout(function () { doSearch(q); }, 380);
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
        }
      });
    }

    /* ---- click a cover: select it ---- */
    if (resultsGrid) {
      resultsGrid.addEventListener('click', function (e) {
        var card = e.target.closest('.anime-card');
        if (!card) return;
        var id = card.dataset.anilistId;
        if (!id) return;

        resultsGrid.querySelectorAll('.anime-card').forEach(function (c) {
          c.classList.toggle('active', c === card);
        });

        var titleEl = card.querySelector('.t');
        var title = titleEl ? titleEl.textContent : ('anilist ' + id);

        currentAnime = { id: id, title: title, episodes: null, currentEpisode: 1 };
        renderPicked();
        renderEpisodes();
        log('\u2714 selected <b>' + escapeHtml(title) + '</b> \u2014 choose an episode, then hit Search on site');
      });
    }

    /* ---- episode pills ---- */
    if (episodesWrap) {
      episodesWrap.addEventListener('click', function (e) {
        var b = e.target.closest('.anime-ep-btn');
        if (!b || !currentAnime) return;
        var ep = Number(b.dataset.episode) || 1;
        episodesWrap.querySelectorAll('.anime-ep-btn').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
        currentAnime.currentEpisode = ep;
        renderPicked();
      });
    }

    /* ---- manual select ---- */
    function manualSelect() {
      var anime = parseAnimeId(idInput.value);
      var episode = parseInt(epInput.value, 10);
      if (!anime) {
        log('\u274C invalid id \u2014 try <b>154587</b>, <b>mal-52991</b>, or paste an anilist / myanimelist url.');
        return;
      }
      if (!isFinite(episode) || episode < 1) {
        log('\u274C episode must be a positive whole number.');
        return;
      }
      currentAnime = { id: anime, title: anime, episodes: null, currentEpisode: episode };
      renderPicked();
      renderEpisodes();
      if (resultsGrid) {
        resultsGrid.querySelectorAll('.anime-card').forEach(function (c) { c.classList.remove('active'); });
      }
      log('\u2714 selected <b>' + escapeHtml(anime) + '</b> ep ' + episode + ' \u2014 hit Search on site');
    }

    if (loadBtn) loadBtn.addEventListener('click', manualSelect);
    [idInput, epInput].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); manualSelect(); }
      });
    });

    /* ---- SUB / DUB toggle: preference only ---- */
    langBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var newLang = b.dataset.lang;
        if (newLang === currentLang) return;
        currentLang = newLang;
        syncLangButtons();
        renderPicked();
      });
    });

    if (openBtn) openBtn.addEventListener('click', openWatchSite);
    if (copyBtn) copyBtn.addEventListener('click', copyTitle);

    syncLangButtons();
    renderPicked();
    updateOpenButton();
  }

  /* =========================================================================
     8. Boot
     ========================================================================= */
  function boot() {
    if (injectTabs()) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectTabs, { once: true });
    }
  }
  boot();
})();
