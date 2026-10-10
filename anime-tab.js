/* anime-tab.js
 * ---------------------------------------------------------------------------
 * Adds an "Anime" tab (right after Guides) to the grades/attendance site,
 * powered by the ani.pm player SDK (https://ani.pm/developers).
 *
 * SETUP — one line, that's it:
 *   1. Put this file next to index.html
 *   2. Add this right before </body> in index.html:
 *
 *          <script src="anime-tab.js" defer></script>
 *
 * That's the whole install. This script injects its own CSS, the tab button,
 * the tab panel, and the player logic — nothing else in your HTML changes.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* =========================================================================
     1. Styles (uses the site's existing CSS variables)
     ========================================================================= */
  var CSS = [
    '.anime-wrap { max-width: 1000px; margin: 0 auto; padding: 0 32px 120px; }',
    '.anime-wrap h1 { font-family: var(--serif); font-size: 32px; font-weight: 500; margin: 0 0 8px; }',
    '.anime-wrap .rule { height: 1px; background: var(--line); margin-bottom: 36px; }',
    '.anime-hint { font-size: 13.5px; color: var(--muted); margin: -20px 0 28px; line-height: 1.65; }',
    '.anime-hint a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent); }',
    '.anime-hint a:hover, .anime-hint a:focus-visible { color: var(--ink); border-bottom-color: var(--ink); }',
    '.anime-hint code { background: var(--accent-soft); border: 1px solid var(--line); padding: 1px 6px; border-radius: 4px; font-size: 12.5px; color: var(--accent); font-family: ui-monospace, Menlo, Consolas, monospace; }',
    '.anime-controls { display: grid; grid-template-columns: minmax(0, 1fr) 120px auto auto; gap: 12px; margin-bottom: 22px; align-items: end; }',
    '.anime-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }',
    '.anime-field label { font-size: 11.5px; color: var(--muted); letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; }',
    '.anime-input { background: var(--accent-soft); border: 1px solid var(--line); color: var(--ink); font-family: var(--sans); font-size: 15px; padding: 11px 14px; border-radius: 8px; outline: none; transition: border-color 0.15s ease, background 0.15s ease; -webkit-appearance: none; width: 100%; }',
    '.anime-input::placeholder { color: var(--muted); }',
    '.anime-input:focus { border-color: var(--accent); background: #2E3328; }',
    '.anime-input::-webkit-outer-spin-button, .anime-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }',
    '.anime-input[type="number"] { -moz-appearance: textfield; }',
    '.anime-lang-toggle { display: flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; height: 44px; background: var(--accent-soft); }',
    '.anime-lang-toggle button { background: transparent; border: none; color: var(--muted); font-family: var(--sans); font-size: 13.5px; font-weight: 600; letter-spacing: 0.06em; padding: 0 22px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }',
    '.anime-lang-toggle button:hover { color: var(--ink); }',
    '.anime-lang-toggle button.active { background: var(--accent); color: var(--paper); }',
    '.anime-load-btn { background: var(--accent-soft); border: 1px solid var(--accent); color: var(--accent); font-family: var(--serif); font-size: 15px; font-weight: 500; padding: 0 28px; height: 44px; border-radius: 8px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; white-space: nowrap; }',
    '.anime-load-btn:hover, .anime-load-btn:focus-visible { background: var(--accent); color: var(--paper); outline: none; }',
    '.anime-load-btn:disabled { opacity: 0.5; cursor: progress; }',
    '.anime-player-shell { background: #000; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-bottom: 18px; min-height: 220px; }',
    '#animePlayer { width: 100%; display: block; }',
    '.anime-status { background: var(--accent-soft); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.7; color: #C9C5B6; height: 180px; overflow-y: auto; }',
    '.anime-status .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.anime-status .line b { color: var(--accent); font-weight: 500; }',
    '.anime-status .ts { color: #6B685D; margin-right: 10px; font-size: 11px; }',
    '.anime-status:empty::before { content: "log will appear here\\2026"; color: #6B685D; }',
    '@media (max-width: 760px) {',
    '  .anime-wrap { padding: 0 20px 80px; }',
    '  .anime-controls { grid-template-columns: 1fr 1fr; }',
    '  .anime-field.anime-field-wide { grid-column: 1 / -1; }',
    '  .anime-lang-toggle { width: 100%; }',
    '  .anime-lang-toggle button { flex: 1; padding: 0; }',
    '  .anime-load-btn { grid-column: 1 / -1; }',
    '}'
  ].join('\n');

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* =========================================================================
     2. Inject the tab button (after "Guides") + the tab panel
     ========================================================================= */
  function injectTabs() {
    // Don't double-inject if the script runs twice.
    if (document.getElementById('tab-anime')) return true;

    var tabs = document.querySelector('.tabs');
    var guidesBtn = tabs && tabs.querySelector('[data-tab="guides"]');
    var guidesPanel = document.getElementById('tab-guides');
    if (!tabs || !guidesBtn || !guidesPanel) return false;

    // --- the button ---
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.dataset.tab = 'anime';
    btn.setAttribute('role', 'tab');
    btn.textContent = 'Anime';
    guidesBtn.insertAdjacentElement('afterend', btn);

    // --- the panel ---
    var panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.id = 'tab-anime';
    panel.innerHTML = [
      '<div class="anime-wrap">',
      '  <h1>anime</h1>',
      '  <div class="rule"></div>',
      '',
      '  <p class="anime-hint">',
      '    powered by <a href="https://ani.pm" target="_blank" rel="noopener noreferrer">ani.pm</a>.',
      '    paste an anilist id (the number in the url, like <code>154587</code>), a mal id (<code>mal-52991</code>),',
      '    or just paste the full anilist / myanimelist url and it&rsquo;ll figure it out. if a link gets blocked, try a different title or use a proxy.',
      '  </p>',
      '',
      '  <div class="anime-controls">',
      '    <div class="anime-field anime-field-wide">',
      '      <label for="animeIdInput">anilist / mal id or url</label>',
      '      <input type="text" id="animeIdInput" class="anime-input" placeholder="154587  &middot;  mal-52991  &middot;  https://anilist.co/anime/154587" value="154587" autocomplete="off" spellcheck="false">',
      '    </div>',
      '    <div class="anime-field">',
      '      <label for="animeEpInput">episode</label>',
      '      <input type="number" id="animeEpInput" class="anime-input" value="1" min="1" step="1" inputmode="numeric">',
      '    </div>',
      '    <div class="anime-field">',
      '      <label>language</label>',
      '      <div class="anime-lang-toggle" role="group" aria-label="Language">',
      '        <button type="button" data-lang="sub" class="active" aria-pressed="true">SUB</button>',
      '        <button type="button" data-lang="dub" aria-pressed="false">DUB</button>',
      '      </div>',
      '    </div>',
      '    <button type="button" id="animeLoadBtn" class="anime-load-btn">Load</button>',
      '  </div>',
      '',
      '  <div class="anime-player-shell"><div id="animePlayer"></div></div>',
      '',
      '  <div class="anime-status" id="animeStatus" aria-live="polite"></div>',
      '</div>'
    ].join('\n');
    guidesPanel.insertAdjacentElement('afterend', panel);

    // --- tab switching (mirrors the site's own behavior) ---
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
     3. The player
     ========================================================================= */
  var initialized = false;
  var player = null;
  var sdkPromise = null;
  var currentLang = 'sub';

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

  // Lazy: the SDK only loads when the Anime tab is actually opened.
  function loadSDK() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (window.AniPM) return resolve(window.AniPM);
      var s = document.createElement('script');
      s.src = 'https://ani.pm/embed/sdk/v1.js';
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

  // Accepts: "154587", "mal-52991", a full AniList URL, or a MyAnimeList URL.
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

  function wirePlayerEvents(p) {
    p.on('ready', function (s) { log('&#x2705; ready &mdash; <b>' + (s && s.title ? s.title : 'unknown title') + '</b>'); });
    p.on('playing', function () { log('&#x25B6; playing'); });
    p.on('pause', function () { log('&#x23F8; paused'); });
    p.on('waiting', function () { log('&hellip; buffering'); });
    p.on('ended', function () { log('&#x23F9; finished'); });
    p.on('episodechange', function (s) { log('&#x21AA; episode &rarr; <b>' + (s && s.episode) + '</b>'); });
    p.on('languagechange', function (s) { log('&#x21AA; language &rarr; <b>' + (s && s.lang) + '</b>'); });
    p.on('error', function (e) { log('&#x26A0;&#xFE0F; ' + (e && e.message ? e.message : 'player error')); });
  }

  function initAnime() {
    if (initialized) return;
    initialized = true;

    var idInput = document.getElementById('animeIdInput');
    var epInput = document.getElementById('animeEpInput');
    var loadBtn = document.getElementById('animeLoadBtn');
    var langBtns = document.querySelectorAll('.anime-lang-toggle button');
    if (!idInput || !epInput || !loadBtn) return;

    function mount() {
      var anime = parseAnimeId(idInput.value);
      var episode = parseInt(epInput.value, 10);

      if (!anime) {
        log('&#x274C; invalid id &mdash; try <b>154587</b>, <b>mal-52991</b>, or paste an anilist / myanimelist url.');
        return;
      }
      if (!isFinite(episode) || episode < 1) {
        log('&#x274C; episode must be a positive whole number.');
        return;
      }

      loadBtn.disabled = true;
      log('&hellip; loading player sdk');
      loadSDK().then(function () {
        if (player) {
          log('&#x21BB; loading <b>' + anime + '</b> ep ' + episode + ' (' + currentLang + ')');
          return player.loadTitle(anime, episode, { lang: currentLang });
        }
        log('&#x25B6; loading <b>' + anime + '</b> ep ' + episode + ' (' + currentLang + ')');
        player = new window.AniPM.Player('#animePlayer', {
          anime: anime,
          episode: episode,
          lang: currentLang
        });
        wirePlayerEvents(player);
      }).catch(function (err) {
        log('&#x274C; ' + (err && err.message ? err.message : err));
      }).then(function () {
        loadBtn.disabled = false;
      });
    }

    loadBtn.addEventListener('click', mount);
    [idInput, epInput].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); mount(); }
      });
    });

    langBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var newLang = b.dataset.lang;
        if (newLang === currentLang) return;
        langBtns.forEach(function (x) {
          var on = x === b;
          x.classList.toggle('active', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        currentLang = newLang;
        if (player) {
          player.setLanguage(currentLang).then(function () {
            log('&#x21AA; language &rarr; <b>' + currentLang + '</b>');
          }).catch(function (err) {
            log('&#x26A0;&#xFE0F; ' + (err && err.message ? err.message : 'could not change language'));
          });
        }
      });
    });

    // Auto-load the default title (Frieren ep 1) so the tab isn't empty.
    mount();
  }

  /* =========================================================================
     4. Boot — run when the DOM is ready (works with or without `defer`)
     ========================================================================= */
  function boot() {
    if (injectTabs()) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectTabs, { once: true });
    }
  }
  boot();
})();
