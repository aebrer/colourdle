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
    const normalized = guess.toLowerCase().trim();
    let bestScore = -1;
    let bestColour = null;
    for (const c of COLOURS) {
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
  // Game state
  // ----------------------------------------------------------
  const ROUNDS_DAILY = 5;
  let state = {
    mode: 'daily',
    round: 0,
    colours: [],
    results: [],
    totalName: 0,
    totalHSB: 0,
    totalScore: 0,
    playing: false,
  };

  function getDailyNumber() {
    const epoch = new Date('2026-03-04');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - epoch) / 86400000) + 1;
  }

  function pickDailyColours() {
    const seed = hashString('colourdle-' + getDailyNumber());
    const rng = mulberry32(seed);
    const picked = [];
    const used = new Set();
    while (picked.length < ROUNDS_DAILY) {
      const idx = Math.floor(rng() * COLOURS.length);
      if (!used.has(idx)) {
        used.add(idx);
        picked.push(COLOURS[idx]);
      }
    }
    return picked;
  }

  function pickRandomColour() {
    return COLOURS[Math.floor(Math.random() * COLOURS.length)];
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

  function saveDaily(dayNum, results, totals) {
    var store = loadStorage();
    if (!store.days) store.days = {};
    store.days[dayNum] = {
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
        };
      }),
      totalName: totals.name,
      totalHSB: totals.hsb,
      totalScore: totals.score,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function getDailyResult(dayNum) {
    var store = loadStorage();
    return store.days && store.days[dayNum] || null;
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
      };
    });
  }

  // ----------------------------------------------------------
  // Game flow
  // ----------------------------------------------------------
  function startGame() {
    // If daily already completed, show saved summary
    if (state.mode === 'daily') {
      var saved = getDailyResult(getDailyNumber());
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
    if (state.mode === 'daily') {
      state.colours = pickDailyColours();
    } else {
      state.colours = [];
    }
    showRound();
  }

  function showRound() {
    let target;
    if (state.mode === 'daily') {
      target = state.colours[state.round];
    } else {
      target = pickRandomColour();
      state.colours.push(target);
    }

    const roundNum = state.round + 1;
    const total = state.mode === 'daily' ? ROUNDS_DAILY : '\u221E';
    $('#round-counter').textContent = roundNum + ' / ' + total;
    $('#running-score').textContent = state.totalScore;
    $('#game-source').textContent = target.src;
    $('#guess-input').value = '';

    // Show finish button in infinite mode after at least 1 round
    $('#btn-finish').style.display = (state.mode === 'infinite' && state.round > 0) ? '' : 'none';

    setTheme(target.hex);
    showScreen('game');
    setTimeout(function () { $('#guess-input').focus(); }, 100);
  }

  function submitGuess() {
    const input = $('#guess-input').value.trim();
    if (!input) return;

    const target = state.colours[state.round];
    const match = findBestMatch(input);

    const nameScore = stringSimilarity(input, target.name);
    const hsbScore = Math.round(colourScore(target.hex, match.colour.hex));

    // Exact colour match bonus (2x) — matched the exact same colour entry
    const exactMatch = match.colour.hex === target.hex;

    // Power mean (p=3) — favours the higher of the two scores
    const p = 3;
    var roundTotal = Math.round(Math.pow((Math.pow(nameScore, p) + Math.pow(hsbScore, p)) / 2, 1 / p));
    if (exactMatch) roundTotal = roundTotal * 2;

    state.results.push({
      target: target,
      guess: input,
      matched: match.colour,
      matchSimilarity: match.similarity,
      nameScore: nameScore,
      hsbScore: hsbScore,
      total: roundTotal,
    });

    state.totalName += nameScore;
    state.totalHSB += hsbScore;
    state.totalScore += roundTotal;

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

    const isLast = state.mode === 'daily' && state.round >= ROUNDS_DAILY - 1;
    $('#btn-next').textContent = isLast ? 'Results' : 'Next';

    showScreen('result');
  }

  function nextRound() {
    state.round++;
    if (state.mode === 'daily' && state.round >= ROUNDS_DAILY) {
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
      $('#summary-title').textContent = 'Colourdle #' + dayNum;
      $('#btn-back').style.display = 'none';
      // Persist daily results
      if (!getDailyResult(dayNum)) {
        saveDaily(dayNum, state.results, {
          name: state.totalName,
          hsb: state.totalHSB,
          score: state.totalScore,
        });
      }
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

  function renderHistory() {
    var historyEl = $('#history');
    historyEl.textContent = '';
    var days = getAllDailyResults();
    var dayNums = Object.keys(days).map(Number).sort(function (a, b) { return b - a; });
    if (dayNums.length === 0) return;

    historyEl.appendChild(el('div', 'history-title', 'History'));

    dayNums.forEach(function (num) {
      var day = days[num];
      var maxScore = day.results.length * 200;
      var row = el('button', 'history-row');

      var label = el('span', 'history-label', '#' + num);
      var score = el('span', 'history-score ' + scoreClass(day.totalScore, maxScore),
        day.totalScore + '/' + maxScore);

      row.appendChild(label);
      row.appendChild(score);
      row.addEventListener('click', function () { viewDay(num); });
      historyEl.appendChild(row);
    });
  }

  function viewDay(dayNum) {
    var saved = getDailyResult(dayNum);
    if (!saved) return;

    viewingHistory = true;
    state.results = savedToResults(saved);
    state.totalName = saved.totalName;
    state.totalHSB = saved.totalHSB;
    state.totalScore = saved.totalScore;
    state.mode = 'daily';

    // Temporarily override getDailyNumber for summary title
    var realDay = getDailyNumber();
    $('#summary-title').textContent = 'Colourdle #' + dayNum;
    $('#btn-back').style.display = dayNum !== realDay ? '' : 'none';
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
      nameWrap.appendChild(el('div', 'summary-guess-name', r.guess + ' \u2192 ' + r.matched.name));

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
      .map(function (r) { return scoreEmoji(r.nameScore, 100) + scoreEmoji(r.hsbScore, 100); })
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

  $('#guess-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitGuess();
  });

  $('#btn-daily').addEventListener('click', function () {
    state.mode = 'daily';
    $('#btn-daily').classList.add('active');
    $('#btn-infinite').classList.remove('active');
    resetTheme();
    showScreen('start');
  });

  $('#btn-infinite').addEventListener('click', function () {
    state.mode = 'infinite';
    $('#btn-infinite').classList.add('active');
    $('#btn-daily').classList.remove('active');
    resetTheme();
    showScreen('start');
  });

  // ----------------------------------------------------------
  // Dark mode
  // ----------------------------------------------------------
  function applyDarkMode(dark) {
    document.documentElement.classList.toggle('dark', dark);
    $('#btn-theme').textContent = dark ? 'Light' : 'Dark';
    var store = loadStorage();
    store.dark = dark;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  $('#btn-theme').addEventListener('click', function () {
    applyDarkMode(!isDark());
  });

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  (function () {
    var store = loadStorage();
    var prefersDark = store.dark != null ? store.dark : window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyDarkMode(prefersDark);
  })();
  renderHistory();

})();
