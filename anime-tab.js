/* anime-tab.js
 * ---------------------------------------------------------------------------
 * Adds an "Anime" tab (right after Guides) to the grades/attendance site,
 * powered by the ani.pm player SDK (https://ani.pm/developers).
 *
 * Features:
 *   - AniList browse UI: search bar + trending grid + cover-art cards
 *   - Click a cover → plays immediately
 *   - Persistent SUB / DUB toggle above the player (always visible)
 *   - If a dub isn't available for a title, it automatically plays sub
 *   - Episode pills for one-tap episode switching
 *   - Manual ID / URL entry as a fallback
 *   - Live event log
 *
 * SETUP — one line:
 *   Add this right before </body> in index.html:
 *
 *          <script src="anime-tab.js" defer></script>
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* =========================================================================
     CONSTANTS
     ========================================================================= */
  var ANILIST_API = 'https://graphql.anilist.co';
  var SDK_URL = 'https://ani.pm/embed/sdk/v1.js';
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
    /* --- tab shell --- */
    '.anime-wrap { max-width: 1000px; margin: 0 auto; padding: 0 32px 120px; }',
    '.anime-wrap h1 { font-family: var(--serif); font-size: 32px; font-weight: 500; margin: 0 0 8px; }',
    '.anime-wrap .rule { height: 1px; background: var(--line); margin-bottom: 36px; }',

    /* --- search --- */
    '.anime-hint { font-size: 13.5px; color: var(--muted); margin: -20px 0 22px; line-height: 1.65; }',
    '.anime-hint a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent); }',
    '.anime-hint a:hover, .anime-hint a:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }',
    '.anime-search-wrap { position: relative; margin-bottom: 12px; }',
    '.anime-search { width: 100%; background: var(--accent-soft); border: 1px solid var(--line); color: var(--ink); font-family: var(--sans); font-size: 15px; padding: 13px 44px 13px 16px; border-radius: 8px; outline: none; transition: border-color 0.15s ease, background 0.15s ease; -webkit-appearance: none; }',
    '.anime-search::placeholder { color: var(--muted); }',
    '.anime-search:focus { border-color: var(--accent); background: #2E3328; }',
    '.anime-search-icon { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; font-size: 15px; }',
    '.anime-search-status { font-size: 12.5px; color: var(--muted); margin: 0 0 14px; min-height: 18px; letter-spacing: 0.02em; }',

    /* --- results grid --- */
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

    /* --- manual entry (collapsed) --- */
    '.anime-manual { border: 1px solid var(--line); border-radius: 8px; padding: 0 16px; margin-bottom: 26px; background: transparent; }',
    '.anime-manual > summary { cursor: pointer; list-style: none; font-size: 13.5px; color: var(--muted); padding: 12px 0; user-select: none; transition: color 0.15s ease; }',
    '.anime-manual > summary::-webkit-details-marker { display: none; }',
    '.anime-manual > summary::before { content: "\\203A"; display: inline-block; margin-right: 9px; transition: transform 0.15s ease; color: var(--accent); }',
    '.anime-manual[open] > summary::before { transform: rotate(90deg); }',
    '.anime-manual > summary:hover { color: var(--ink); }',

    /* --- form controls --- */
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
    '.anime-load-btn:disabled { opacity: 0.5; cursor: progress; }',

    /* --- persistent SUB/DUB toggle --- */
    '.anime-lang-block { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }',
    '.anime-lang-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; height: 38px; background: var(--accent-soft); flex-shrink: 0; }',
    '.anime-lang-toggle button { background: transparent; border: none; color: var(--muted); font-family: var(--sans); font-size: 12.5px; font-weight: 600; letter-spacing: 0.08em; padding: 0 18px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }',
    '.anime-lang-toggle button:hover { color: var(--ink); }',
    '.anime-lang-toggle button.active { background: var(--accent); color: var(--paper); }',
    '.anime-lang-toggle button:disabled { cursor: not-allowed; opacity: 0.55; }',
    '.anime-lang-note { font-size: 11px; color: var(--muted); line-height: 1.4; text-align: right; max-width: 220px; }',

    /* --- now playing bar --- */
    '.anime-nowbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 0 0 12px; min-height: 38px; flex-wrap: wrap; }',
    '.anime-picked { font-size: 14px; color: var(--muted); margin: 0; line-height: 1.5; flex: 1 1 auto; min-width: 0; padding-top: 8px; }',
    '.anime-picked b { color: var(--accent); font-weight: 500; }',
    '.anime-picked .fallback-note { color: var(--accent); }',

    /* --- episode pills --- */
    '.anime-episodes { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }',
    '.anime-episodes:empty { display: none; }',
    '.anime-ep-btn { background: var(--accent-soft); border: 1px solid var(--line); color: var(--muted); font-family: var(--sans); font-size: 12px; font-weight: 500; min-width: 36px; height: 30px; padding: 0 8px; border-radius: 6px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }',
    '.anime-ep-btn:hover, .anime-ep-btn:focus-visible { color: var(--ink); border-color: var(--accent); outline: none; }',
    '.anime-ep-btn.active { background: var(--accent); color: var(--paper); border-color: var(--accent); }',
    '.anime-ep-more { font-size: 12px; color: var(--muted); align-self: center; padding-left: 4px; }',

    /* --- player --- */
    '.anime-player-shell { background: #000; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-bottom: 18px; min-height: 220px; }',
    '#animePlayer { width: 100%; display: block; }',

    /* --- event log --- */
    '.anime-status { background: var(--accent-soft); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.7; color: #C9C5B6; height: 160px; overflow-y: auto; }',
    '.anime-status .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.anime-status .line b { color: var(--accent); font-weight: 500; }',
    '.anime-status .ts { color: #6B685D; margin-right: 10px; font-size: 11px; }',
    '.anime-status:empty::before { content: "log will appear here\\2026"; color: #6B685D; }',

    /* --- mobile --- */
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
     2. Inject the tab button + panel
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

    var panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = 'tab-anime';
    panel.innerHTML = [
      '<div class="anime-wrap">',
      '  <h1>anime</h1>',
      '  <div class="rule"></div>',
      '',
      '  <p class="anime-hint">',
      '    powered by <a href="https://ani.pm" target="_blank" rel="noopener noreferrer">ani.pm</a>',
      '    &middot; data from <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">anilist</a>.',
      '    search below and click a cover to play. switch sub / dub anytime with the toggle above the player.',
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
      '      <button type="button" id="animeLoadBtn" class="anime-load-btn">Load</button>',
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
      '      <div class="anime-lang-note">if a dub isn&rsquo;t available, it plays sub automatically</div>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="anime-episodes" id="animeEpisodes" role="group" aria-label="Episode"></div>',
      '',
      '  <div class="anime-player-shell"><div id="animePlayer"></div></div>',
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
     3. Player state
     ========================================================================= */
  var initialized = false;
  var player = null;
  var sdkPromise = null;
  var currentLang = 'sub';
  var currentAnime = null;   // { id, title, episodes, currentEpisode }
  var requestedLang = 'sub'; // what the user asked for (may differ from what's playing)

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

  function loadSDK() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (window.AniPM) return resolve(window.AniPM);
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () {
        window.AniPM ? resolve(window.AniPM) : reject(new Error('SDK loaded but AniPM global is missing.'));
      };
      s.onerror = function () {
        reject(new Error('could not load the ani.pm SDK (network or blocker)'));
      };
      document.head.appendChild(s);
    });
    return sdkPromise;
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
      return;
    }
    var html = 'now playing: <b>' + escapeHtml(currentAnime.title) + '</b> (anilist <b>' +
      escapeHtml(String(currentAnime.id)) + '</b>)';
    if (currentAnime.fellBackToSub) {
      html += ' <span class="fallback-note">&middot; no dub available, playing sub</span>';
    }
    el.innerHTML = html;
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

  /* =========================================================================
     6. Play + lang logic
     ========================================================================= */
  function syncLangButtons() {
    document.querySelectorAll('.anime-lang-toggle button').forEach(function (b) {
      var on = b.dataset.lang === currentLang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function play(animeId, episode) {
    var idStr = String(animeId);
    var ep = Number(episode) || 1;

    if (currentAnime) {
      currentAnime.currentEpisode = ep;
      currentAnime.fellBackToSub = false;
    }
    renderEpisodes();
    renderPicked();

    var loadBtn = document.getElementById('animeLoadBtn');
    if (loadBtn) loadBtn.disabled = true;

    log('\u2026 loading player sdk (' + currentLang + ')');
    loadSDK().then(function () {
      if (player) {
        log('\u21BB loading <b>' + escapeHtml(idStr) + '</b> ep ' + ep + ' (' + currentLang + ')');
        return player.loadTitle(idStr, ep, { lang: currentLang });
      }
      log('\u25B6 loading <b>' + escapeHtml(idStr) + '</b> ep ' + ep + ' (' + currentLang + ')');
      player = new window.AniPM.Player('#animePlayer', {
        anime: idStr,
        episode: ep,
        lang: currentLang
      });
      wirePlayerEvents(player);
    }).catch(function (err) {
      log('\u274C ' + escapeHtml(err && err.message ? err.message : String(err)));
    }).then(function () {
      if (loadBtn) loadBtn.disabled = false;
    });
  }

  function wirePlayerEvents(p) {
    p.on('ready', function (s) { log('\u2705 ready \u2014 <b>' + escapeHtml(s && s.title ? s.title : 'unknown title') + '</b>'); });
    p.on('playing', function () { log('\u25B6 playing'); });
    p.on('pause', function () { log('\u23F8 paused'); });
    p.on('waiting', function () { log('\u2026 buffering'); });
    p.on('ended', function () { log('\u23F9 finished'); });
    p.on('episodechange', function (s) {
      log('\u21AA episode \u2192 <b>' + (s && s.episode) + '</b>');
      if (currentAnime) { currentAnime.currentEpisode = Number(s && s.episode) || 1; renderEpisodes(); }
    });
    p.on('languagechange', function (s) {
      var playingLang = s && s.lang ? String(s.lang).toLowerCase() : '';
      log('\u21AA language \u2192 <b>' + escapeHtml(playingLang || 'unknown') + '</b>');

      // If the viewer asked for DUB but the player reports SUB, a dub wasn't
      // available for this title/episode, so we're auto-playing sub instead.
      if (requestedLang === 'dub' && playingLang === 'sub') {
        if (currentAnime) {
          currentAnime.fellBackToSub = true;
          renderPicked();
        }
        // reflect the reality in the toggle + local state
        currentLang = 'sub';
        syncLangButtons();
        log('\u2139\uFE0F no dub for this title \u2014 automatically playing <b>sub</b>');
      }
    });
    p.on('error', function (e) { log('\u26A0\uFE0F ' + escapeHtml(e && e.message ? e.message : 'player error')); });
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

    /* ---- click a cover ---- */
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

        currentAnime = { id: id, title: title, episodes: null, currentEpisode: 1, fellBackToSub: false };
        renderPicked();
        renderEpisodes();
        play(id, 1);
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
        play(currentAnime.id, ep);
      });
    }

    /* ---- manual load ---- */
    function manualLoad() {
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
      currentAnime = { id: anime, title: anime, episodes: null, currentEpisode: episode, fellBackToSub: false };
      renderPicked();
      renderEpisodes();
      if (resultsGrid) {
        resultsGrid.querySelectorAll('.anime-card').forEach(function (c) { c.classList.remove('active'); });
      }
      play(anime, episode);
    }

    if (loadBtn) loadBtn.addEventListener('click', manualLoad);
    [idInput, epInput].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); manualLoad(); }
      });
    });

    /* ---- SUB / DUB toggle (persistent) ---- */
    langBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var newLang = b.dataset.lang;
        if (newLang === currentLang) return;
        currentLang = newLang;
        requestedLang = newLang;
        if (currentAnime) currentAnime.fellBackToSub = false;
        syncLangButtons();
        renderPicked();

        if (player) {
          var id = currentAnime ? currentAnime.id : null;
          var ep = currentAnime ? currentAnime.currentEpisode : 1;
          if (id) {
            log('\u21AA switching to <b>' + currentLang.toUpperCase() + '</b>\u2026');
            player.loadTitle(String(id), ep, { lang: currentLang }).catch(function (err) {
              log('\u26A0\uFE0F ' + escapeHtml(err && err.message ? err.message : 'could not switch language'));
            });
          } else {
            log('\u21AA language set to <b>' + currentLang.toUpperCase() + '</b> (applies on next load)');
          }
        } else {
          log('\u21AA language set to <b>' + currentLang.toUpperCase() + '</b> (applies on next load)');
        }
      });
    });

    syncLangButtons();
    renderPicked();
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
