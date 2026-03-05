// ============================================================
// Colourdle — Game Engine
// ============================================================

(function () {
  'use strict';

  // ----------------------------------------------------------
  // Utility: Seeded PRNG (mulberry32)
  // ----------------------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  // ----------------------------------------------------------
  // Colour conversions + contrast
  // ----------------------------------------------------------
  function hexToRGB(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  // Relative luminance (WCAG)
  function luminance(hex) {
    const { r, g, b } = hexToRGB(hex);
    const srgb = [r, g, b].map(function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  // Set CSS custom properties for a given background colour
  function setTheme(hex) {
    const lum = luminance(hex);
    const dark = lum > 0.35;
    document.documentElement.style.setProperty('--bg', hex);
    document.documentElement.style.setProperty('--fg', dark ? '#000' : '#fff');
    document.documentElement.style.setProperty('--fg-dim', dark ? '#00000066' : '#ffffff66');
  }

  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  function resetTheme() {
    // Clear inline overrides so CSS class takes effect
    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--fg');
    document.documentElement.style.removeProperty('--fg-dim');
  }

  // ----------------------------------------------------------
  // CIELAB Delta E (CIE76) — perceptual colour distance
  // ----------------------------------------------------------
  function rgbToLab(r, g, b) {
    // sRGB to linear
    var rgb = [r / 255, g / 255, b / 255].map(function (c) {
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    // Linear RGB to XYZ (D65)
    var x = rgb[0] * 0.4124564 + rgb[1] * 0.3575761 + rgb[2] * 0.1804375;
    var y = rgb[0] * 0.2126729 + rgb[1] * 0.7151522 + rgb[2] * 0.0721750;
    var z = rgb[0] * 0.0193339 + rgb[1] * 0.1191920 + rgb[2] * 0.9503041;

    // XYZ to Lab (D65 reference white)
    x /= 0.95047; y /= 1.00000; z /= 1.08883;
    var f = function (t) {
      return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + (16 / 116);
    };
    return {
      L: (116 * f(y)) - 16,
      a: 500 * (f(x) - f(y)),
      b: 200 * (f(y) - f(z)),
    };
  }

  function hexToLab(hex) {
    var c = hexToRGB(hex);
    return rgbToLab(c.r, c.g, c.b);
  }

  function deltaE(lab1, lab2) {
    var dL = lab1.L - lab2.L;
    var da = lab1.a - lab2.a;
    var db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  // Sigmoid scoring: Delta E → 0-100 score
  // dE=0 → 100, dE~30 → ~50, dE~80+ → near 0
  function colourScore(hex1, hex2) {
    var dE = deltaE(hexToLab(hex1), hexToLab(hex2));
    return 100 / (1 + Math.pow(dE / 30, 1.8));
  }

  // ----------------------------------------------------------
  // Fuzzy string similarity (Levenshtein, 0-100)
  // ----------------------------------------------------------
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  function stringSimilarity(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 100;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 100;
    return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
  }

  function findBestMatch(guess) {
    var pool = state.palette === 'All' ? COLOURS : getPool();
    const normalized = guess.toLowerCase().trim();
    let bestScore = -1;
    let bestColour = null;
    for (const c of pool) {
      const score = stringSimilarity(normalized, c.name);
      if (score > bestScore) {
        bestScore = score;
        bestColour = c;
      }
    }
    return { colour: bestColour, similarity: bestScore };
  }

  // ----------------------------------------------------------
  // DOM helpers
  // ----------------------------------------------------------
  const $ = function (sel) { return document.querySelector(sel); };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const screens = {
    start: $('#screen-start'),
    game: $('#screen-game'),
    result: $('#screen-result'),
    summary: $('#screen-summary'),
  };

  function showScreen(name) {
    Object.values(screens).forEach(function (s) { s.classList.remove('active'); });
    screens[name].classList.add('active');
  }

  // ----------------------------------------------------------
  // Palette filtering
  // ----------------------------------------------------------
  function getPool() {
    var palette = state.palette;
    if (palette === 'All') return COLOURS;
    return COLOURS.filter(function (c) { return c.src === palette; });
  }

  // ----------------------------------------------------------
  // Game state
  // ----------------------------------------------------------
  const ROUNDS_DAILY = 5;
  const ROUNDS_ITERATIVE = 5;
  const MAX_ITER_GUESSES = 10;
  let state = {
    mode: 'daily',
    palette: 'All',
    round: 0,
    colours: [],
    results: [],
    totalName: 0,
    totalHSB: 0,
    totalScore: 0,
    playing: false,
    // Iterative mode state
    iterGuessCount: 0,
    iterBest: null,
    iterLast: null,
  };

  function getDailyNumber() {
    const epoch = new Date('2026-03-04');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - epoch) / 86400000) + 1;
  }

  function pickDailyColours() {
    var pool = getPool();
    const seed = hashString('colourdle-' + state.palette + '-' + getDailyNumber());
    const rng = mulberry32(seed);
    const picked = [];
    const used = new Set();
    while (picked.length < ROUNDS_DAILY) {
      const idx = Math.floor(rng() * pool.length);
      if (!used.has(idx)) {
        used.add(idx);
        picked.push(pool[idx]);
      }
    }
    return picked;
  }

  function pickRandomColour() {
    var pool = getPool();
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ----------------------------------------------------------
  // Score helpers
  // ----------------------------------------------------------
  function scoreClass(score, max) {
    const pct = score / max;
    if (pct >= 0.7) return 'score-great';
    if (pct >= 0.4) return 'score-good';
    return 'score-poor';
  }

  function scoreEmoji(score, max) {
    const pct = score / max;
    if (pct >= 0.85) return '\uD83D\uDFE9';
    if (pct >= 0.6) return '\uD83D\uDFE8';
    if (pct >= 0.35) return '\uD83D\uDFE7';
    return '\uD83D\uDFE5';
  }

  // ----------------------------------------------------------
  // localStorage persistence
  // ----------------------------------------------------------
  var STORAGE_KEY = 'colourdle';

  function loadStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function dailyKey(dayNum, palette) {
    return palette === 'All' ? String(dayNum) : dayNum + ':' + palette;
  }

  function saveDaily(dayNum, palette, results, totals) {
    var store = loadStorage();
    if (!store.days) store.days = {};
    store.days[dailyKey(dayNum, palette)] = {
      palette: palette,
      results: results.map(function (r) {
        return {
          targetName: r.target.name,
          targetHex: r.target.hex,
          targetSrc: r.target.src,
          guess: r.guess,
          matchedName: r.matched.name,
          matchedHex: r.matched.hex,
          matchedSrc: r.matched.src,
          nameScore: r.nameScore,
          hsbScore: r.hsbScore,
          total: r.total,
          guesses: r.guesses || undefined,
        };
      }),
      totalName: totals.name,
      totalHSB: totals.hsb,
      totalScore: totals.score,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function getDailyResult(dayNum, palette) {
    var store = loadStorage();
    var key = palette != null ? dailyKey(dayNum, palette) : String(dayNum);
    return store.days && store.days[key] || null;
  }

  function getAllDailyResults() {
    var store = loadStorage();
    return store.days || {};
  }

  // Reconstruct state.results from saved data for summary display
  function savedToResults(saved) {
    return saved.results.map(function (r) {
      return {
        target: { name: r.targetName, hex: r.targetHex, src: r.targetSrc },
        guess: r.guess,
        matched: { name: r.matchedName, hex: r.matchedHex, src: r.matchedSrc },
        nameScore: r.nameScore,
        hsbScore: r.hsbScore,
        total: r.total,
        guesses: r.guesses || undefined,
      };
    });
  }

  // ----------------------------------------------------------
  // Game flow
  // ----------------------------------------------------------
  function startGame() {
    state.palette = $('#palette').value;

    // If daily already completed, show saved summary
    if (state.mode === 'daily') {
      var saved = getDailyResult(getDailyNumber(), state.palette);
      if (saved) {
        state.results = savedToResults(saved);
        state.totalName = saved.totalName;
        state.totalHSB = saved.totalHSB;
        state.totalScore = saved.totalScore;
        state.playing = false;
        showSummary();
        return;
      }
    }

    state.round = 0;
    state.results = [];
    state.totalName = 0;
    state.totalHSB = 0;
    state.totalScore = 0;
    state.playing = true;
    state.iterGuessCount = 0;
    state.iterBest = null;
    state.iterLast = null;
    if (state.mode === 'daily' || state.mode === 'iterative') {
      state.colours = pickDailyColours();
    } else {
      state.colours = [];
    }
    showRound();
  }

  function showRound() {
    let target;
    if (state.mode === 'daily' || state.mode === 'iterative') {
      target = state.colours[state.round];
    } else {
      target = pickRandomColour();
      state.colours.push(target);
    }

    const roundNum = state.round + 1;
    var total;
    if (state.mode === 'daily') total = ROUNDS_DAILY;
    else if (state.mode === 'iterative') total = ROUNDS_ITERATIVE;
    else total = '\u221E';
    $('#round-counter').textContent = roundNum + ' / ' + total;
    $('#running-score').textContent = state.totalScore;
    $('#game-source').textContent = target.src;
    $('#guess-input').value = '';

    // Show finish button in infinite mode after at least 1 round
    $('#btn-finish').style.display = (state.mode === 'infinite' && state.round > 0) ? '' : 'none';

    // Reset iterative state for this round
    state.iterGuessCount = 0;
    state.iterBest = null;
    state.iterLast = null;
    $('#iter-feedback').style.display = 'none';
    $('#btn-done').style.display = 'none';
    $('#iter-log').textContent = '';
    $('#iter-best').style.display = 'none';

    setTheme(target.hex);
    showScreen('game');
    setTimeout(function () { $('#guess-input').focus(); }, 100);
  }

  function computeRoundScore(input, target, match) {
    var nameScore = stringSimilarity(input, target.name);
    var hsbScore = Math.round(colourScore(target.hex, match.colour.hex));
    var exactMatch = match.colour.hex === target.hex;
    var p = 3;
    var roundTotal = Math.round(Math.pow((Math.pow(nameScore, p) + Math.pow(hsbScore, p)) / 2, 1 / p));
    if (exactMatch) roundTotal = roundTotal * 2;
    return { nameScore: nameScore, hsbScore: hsbScore, total: roundTotal };
  }

  function submitGuess() {
    const input = $('#guess-input').value.trim();
    if (!input) return;

    const target = state.colours[state.round];
    const match = findBestMatch(input);
    var scores = computeRoundScore(input, target, match);

    if (state.mode === 'iterative') {
      state.iterGuessCount++;

      var thisGuess = {
        target: target,
        guess: input,
        matched: match.colour,
        nameScore: scores.nameScore,
        hsbScore: scores.hsbScore,
        total: scores.total,
      };

      state.iterLast = thisGuess;
      if (!state.iterBest || scores.total > state.iterBest.total) {
        state.iterBest = thisGuess;
      }

      // Update "Last" highlight
      $('#iter-last-swatch').style.backgroundColor = match.colour.hex;
      $('#iter-last-name').textContent = input + ' \u2192 ' + match.colour.name;
      $('#iter-last-score').textContent = scores.total;

      // Update "Best" highlight (show only if different from last)
      if (state.iterBest !== state.iterLast) {
        $('#iter-best').style.display = '';
        $('#iter-best-swatch').style.backgroundColor = state.iterBest.matched.hex;
        $('#iter-best-name').textContent = state.iterBest.guess + ' \u2192 ' + state.iterBest.matched.name;
        $('#iter-best-score').textContent = state.iterBest.total;
      } else {
        $('#iter-best').style.display = 'none';
      }

      // Add to scrollable log
      var logEntry = el('div', 'iter-log-entry');
      logEntry.appendChild(el('span', 'iter-log-num', String(state.iterGuessCount)));
      var sw = el('div', 'inline-swatch');
      sw.style.backgroundColor = match.colour.hex;
      logEntry.appendChild(sw);
      logEntry.appendChild(el('span', 'iter-log-name', input + ' \u2192 ' + match.colour.name));
      logEntry.appendChild(el('span', 'iter-log-score', String(scores.total)));
      var logEl = $('#iter-log');
      logEl.insertBefore(logEntry, logEl.firstChild);

      // Status line
      var remaining = MAX_ITER_GUESSES - state.iterGuessCount;
      $('#iter-status').textContent = remaining + ' guess' + (remaining !== 1 ? 'es' : '') + ' remaining';

      $('#iter-feedback').style.display = '';
      $('#btn-done').style.display = '';

      // Auto-done at max guesses
      if (state.iterGuessCount >= MAX_ITER_GUESSES) {
        iterativeDone();
        return;
      }

      $('#guess-input').value = '';
      $('#guess-input').focus();
      return;
    }

    state.results.push({
      target: target,
      guess: input,
      matched: match.colour,
      matchSimilarity: match.similarity,
      nameScore: scores.nameScore,
      hsbScore: scores.hsbScore,
      total: scores.total,
    });

    state.totalName += scores.nameScore;
    state.totalHSB += scores.hsbScore;
    state.totalScore += scores.total;

    showResult(state.results[state.results.length - 1]);
  }

  function showResult(result) {
    // Keep target colour as background
    setTheme(result.target.hex);

    $('#result-target-name').textContent = result.target.name;
    $('#result-target-source').textContent = result.target.src;
    $('#result-guess-swatch').style.backgroundColor = result.matched.hex;
    $('#result-guess-name').textContent = '"' + result.guess + '" \u2192 ' + result.matched.name;
    $('#result-guess-source').textContent = result.matched.src;
    $('#hint-hsb').textContent = 'How close is "' + result.matched.name + '" to the colour?';

    $('#score-name').textContent = result.nameScore;
    $('#score-hsb').textContent = result.hsbScore;
    $('#score-total').textContent = result.total;

    $('#score-name').className = 'score-val ' + scoreClass(result.nameScore, 100);
    $('#score-hsb').className = 'score-val ' + scoreClass(result.hsbScore, 100);
    $('#score-total').className = 'score-val ' + scoreClass(result.total, 200);

    var isLast = (state.mode === 'daily' && state.round >= ROUNDS_DAILY - 1) ||
                 (state.mode === 'iterative' && state.round >= ROUNDS_ITERATIVE - 1);
    $('#btn-next').textContent = isLast ? 'Results' : 'Next';

    showScreen('result');
  }

  function iterativeDone() {
    if (!state.iterBest) return;
    var best = state.iterBest;
    state.iterBest = null; // prevent double-fire
    best.guesses = state.iterGuessCount;
    state.results.push(best);
    state.totalName += best.nameScore;
    state.totalHSB += best.hsbScore;
    state.totalScore += best.total;

    // Show result screen with target reveal (reuse existing result screen)
    showResult(best);
  }

  function nextRound() {
    state.round++;
    if ((state.mode === 'daily' && state.round >= ROUNDS_DAILY) ||
        (state.mode === 'iterative' && state.round >= ROUNDS_ITERATIVE)) {
      showSummary();
    } else {
      showRound();
    }
  }

  function showSummary() {
    state.playing = false;
    viewingHistory = false;

    if (state.mode === 'daily') {
      var dayNum = getDailyNumber();
      var paletteSuffix = state.palette !== 'All' ? ' (' + state.palette + ')' : '';
      $('#summary-title').textContent = 'Colourdle #' + dayNum + paletteSuffix;
      $('#btn-back').style.display = 'none';
      // Persist daily results
      if (!getDailyResult(dayNum, state.palette)) {
        saveDaily(dayNum, state.palette, state.results, {
          name: state.totalName,
          hsb: state.totalHSB,
          score: state.totalScore,
        });
      }
    } else if (state.mode === 'iterative') {
      var totalGuesses = state.results.reduce(function (sum, r) { return sum + (r.guesses || 1); }, 0);
      $('#summary-title').textContent = 'Iterative \u2014 ' + totalGuesses + ' guesses';
      $('#btn-back').style.display = 'none';
    } else {
      $('#summary-title').textContent = 'Infinite \u2014 ' + state.results.length + ' rounds';
      $('#btn-back').style.display = 'none';
    }

    showSummaryContent();
    showScreen('summary');
  }

  // ----------------------------------------------------------
  // History
  // ----------------------------------------------------------
  var viewingHistory = false;

  function parseHistoryKey(key) {
    var parts = key.split(':');
    return { dayNum: parseInt(parts[0], 10), palette: parts[1] || 'All' };
  }

  function renderHistory() {
    var historyEl = $('#history');
    historyEl.textContent = '';
    var days = getAllDailyResults();
    var keys = Object.keys(days).sort(function (a, b) {
      return parseHistoryKey(b).dayNum - parseHistoryKey(a).dayNum;
    });
    if (keys.length === 0) return;

    historyEl.appendChild(el('div', 'history-title', 'History'));

    keys.forEach(function (key) {
      var info = parseHistoryKey(key);
      var day = days[key];
      var maxScore = day.results.length * 200;
      var row = el('button', 'history-row');

      var labelText = '#' + info.dayNum;
      if (info.palette !== 'All') labelText += ' (' + info.palette + ')';
      var label = el('span', 'history-label', labelText);
      var score = el('span', 'history-score ' + scoreClass(day.totalScore, maxScore),
        day.totalScore + '/' + maxScore);

      row.appendChild(label);
      row.appendChild(score);
      row.addEventListener('click', function () { viewDayByKey(key); });
      historyEl.appendChild(row);
    });
  }

  function viewDayByKey(key) {
    var store = loadStorage();
    var saved = store.days && store.days[key] || null;
    if (!saved) return;

    var info = parseHistoryKey(key);
    viewingHistory = true;
    state.results = savedToResults(saved);
    state.totalName = saved.totalName;
    state.totalHSB = saved.totalHSB;
    state.totalScore = saved.totalScore;
    state.palette = info.palette;
    state.mode = 'daily';

    var paletteSuffix = info.palette !== 'All' ? ' (' + info.palette + ')' : '';
    var realKey = dailyKey(getDailyNumber(), state.palette);
    $('#summary-title').textContent = 'Colourdle #' + info.dayNum + paletteSuffix;
    $('#btn-back').style.display = key !== realKey ? '' : 'none';
    showSummaryContent();
    showScreen('summary');
  }

  function showSummaryContent() {
    resetTheme();

    var roundsEl = $('#summary-rounds');
    roundsEl.textContent = '';

    state.results.forEach(function (r) {
      var row = el('div', 'summary-round');

      var swatch = el('div', 'summary-swatch');
      swatch.style.backgroundColor = r.target.hex;

      var nameWrap = el('div', 'summary-name');
      nameWrap.appendChild(el('div', 'summary-target-name', r.target.name));
      nameWrap.appendChild(el('div', 'summary-source', r.target.src));
      var guessText = r.guess + ' \u2192 ' + r.matched.name;
      if (r.guesses) guessText += ' (' + r.guesses + (r.guesses === 1 ? ' guess' : ' guesses') + ')';
      nameWrap.appendChild(el('div', 'summary-guess-name', guessText));

      var score = el('div', 'summary-score ' + scoreClass(r.total, 200), String(r.total));

      row.appendChild(swatch);
      row.appendChild(nameWrap);
      row.appendChild(score);
      roundsEl.appendChild(row);
    });

    var maxName = state.results.length * 100;
    var maxHSB = state.results.length * 100;
    var maxTotal = state.results.length * 200;

    var totalsEl = $('#summary-totals');
    totalsEl.textContent = '';

    [
      ['Name', state.totalName, maxName],
      ['Colour', state.totalHSB, maxHSB],
      ['Total', state.totalScore, maxTotal],
    ].forEach(function (item) {
      var label = item[0], value = item[1], max = item[2];
      var d = el('div', 'summary-total-item');
      d.appendChild(el('div', 'summary-total-label', label));
      d.appendChild(el('div', 'summary-total-value ' + scoreClass(value, max), value + '/' + max));
      totalsEl.appendChild(d);
    });
  }

  // ----------------------------------------------------------
  // Share
  // ----------------------------------------------------------
  function generateShareText() {
    // Use the title already displayed in summary (handles history views correctly)
    var title = $('#summary-title').textContent;

    var emojiGrid = state.results
      .map(function (r) {
        var line = scoreEmoji(r.nameScore, 100) + scoreEmoji(r.hsbScore, 100);
        if (r.guesses) line += ' (' + r.guesses + ')';
        return line;
      })
      .join('\n');

    return title + '\n' + emojiGrid + '\nScore: ' + state.totalScore + '/' + (state.results.length * 200) + '\nhttps://colourdle.ca';
  }

  function share() {
    var text = generateShareText();
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () { copyToClipboard(text); });
    } else {
      copyToClipboard(text);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function () {
      var toast = $('#share-toast');
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 2000);
    });
  }

  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------
  $('#btn-start').addEventListener('click', startGame);
  $('#btn-guess').addEventListener('click', submitGuess);
  $('#btn-next').addEventListener('click', nextRound);
  $('#btn-share').addEventListener('click', share);
  $('#btn-play-again').addEventListener('click', function () {
    resetTheme();
    renderHistory();
    showScreen('start');
  });

  $('#btn-back').addEventListener('click', function () {
    viewingHistory = false;
    resetTheme();
    renderHistory();
    showScreen('start');
  });

  $('#btn-finish').addEventListener('click', function () {
    showSummary();
  });

  $('#btn-done').addEventListener('click', iterativeDone);

  function goHome() {
    resetTheme();
    renderHistory();
    showScreen('start');
  }

  document.querySelectorAll('.chrome-home').forEach(function (btn) {
    btn.addEventListener('click', goHome);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var active = document.querySelector('.screen.active');
    if (!active) return;
    if (active.id === 'screen-game') submitGuess();
    else if (active.id === 'screen-result') nextRound();
    else if (active.id === 'screen-start') startGame();
  });

  function setMode(mode) {
    state.mode = mode;
    ['daily', 'infinite', 'iterative'].forEach(function (m) {
      $('#btn-' + m).classList.toggle('active', m === mode);
    });
    resetTheme();
    renderHistory();
    showScreen('start');
  }

  $('#btn-daily').addEventListener('click', function () { setMode('daily'); });
  $('#btn-infinite').addEventListener('click', function () { setMode('infinite'); });
  $('#btn-iterative').addEventListener('click', function () { setMode('iterative'); });

  // ----------------------------------------------------------
  // Dark mode
  // ----------------------------------------------------------
  function applyDarkMode(dark) {
    document.documentElement.classList.toggle('dark', dark);
    // Clear any inline style overrides so CSS class takes effect
    resetTheme();
    $('#btn-theme').textContent = dark ? '\u2600' : '\u263E';
    var store = loadStorage();
    store.dark = dark;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  $('#btn-theme').addEventListener('click', function () {
    applyDarkMode(!isDark());
  });

  // Save palette preference on change
  $('#palette').addEventListener('change', function () {
    var store = loadStorage();
    store.palette = this.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  });

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  (function () {
    var store = loadStorage();
    if (store.palette) {
      $('#palette').value = store.palette;
      // Read back actual value — select ignores invalid options
      state.palette = $('#palette').value;
    }
    var prefersDark = store.dark != null ? store.dark : window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyDarkMode(prefersDark);
  })();
  renderHistory();

})();
