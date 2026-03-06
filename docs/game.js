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

  // Sigmoid scoring: Delta E -> 0-100 score
  // dE=0 -> 100, dE~30 -> ~50, dE~80+ -> near 0
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

  // ----------------------------------------------------------
  // POEM: Pareto-Optimal Embedded Matching (Brereton et al.)
  // Multiple cheap similarity measures combined via Pareto
  // dominance — no single measure needs to be "right".
  // ----------------------------------------------------------

  // Measure 1: Levenshtein distance (normalized 0-1, lower=closer)
  function mLevenshtein(a, b) {
    var maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 0 : levenshtein(a, b) / maxLen;
  }

  // Measure 2: Word-sorted Levenshtein (order-independent)
  function mSortedLevenshtein(a, b) {
    var sa = a.split(/\s+/).sort().join(' ');
    var sb = b.split(/\s+/).sort().join(' ');
    var maxLen = Math.max(sa.length, sb.length);
    return maxLen === 0 ? 0 : levenshtein(sa, sb) / maxLen;
  }

  // Measure 3: Character bigram Dice coefficient (1 - similarity)
  function bigrams(str) {
    var set = {};
    for (var i = 0; i < str.length - 1; i++) {
      var bg = str.slice(i, i + 2);
      set[bg] = (set[bg] || 0) + 1;
    }
    return set;
  }

  function mBigramDice(a, b) {
    if (a.length < 2 || b.length < 2) return 1;
    var bgA = bigrams(a), bgB = bigrams(b);
    var overlap = 0, totalA = 0, totalB = 0;
    for (var k in bgA) { totalA += bgA[k]; if (bgB[k]) overlap += Math.min(bgA[k], bgB[k]); }
    for (var k in bgB) { totalB += bgB[k]; }
    return 1 - (2 * overlap) / (totalA + totalB);
  }

  // Measure 4: Word-level Jaccard distance (1 - |intersection| / |union|)
  function mWordJaccard(a, b) {
    var setA = new Set(a.split(/\s+/));
    var setB = new Set(b.split(/\s+/));
    var inter = 0;
    setA.forEach(function (w) { if (setB.has(w)) inter++; });
    var union = setA.size + setB.size - inter;
    return union === 0 ? 0 : 1 - inter / union;
  }

  // Measure 5: Best substring containment (1 - ratio of longest common substring)
  function mSubstring(a, b) {
    var short = a.length <= b.length ? a : b;
    var long = a.length <= b.length ? b : a;
    var bestLen = 0;
    for (var i = 0; i < short.length; i++) {
      for (var j = bestLen + 1; j <= short.length - i; j++) {
        if (long.indexOf(short.slice(i, i + j)) !== -1) bestLen = j;
        else break;
      }
    }
    var maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 0 : 1 - bestLen / maxLen;
  }

  // Measure 6: Word containment distance (1 - fraction of query words present in candidate)
  function mWordContainment(a, b) {
    var wordsA = a.split(/\s+/);
    var wordsB = b.split(/\s+/);
    var found = 0;
    wordsA.forEach(function (w) { if (wordsB.indexOf(w) !== -1) found++; });
    return wordsA.length === 0 ? 0 : 1 - found / wordsA.length;
  }

  var POEM_MEASURES = [mLevenshtein, mSortedLevenshtein, mBigramDice, mWordJaccard, mSubstring, mWordContainment];
  var POEM_PRUNE_PCT = 0.5;

  function findBestMatch(guess) {
    var pool = state.palette === 'All' ? COLOURS : getPool();
    var query = guess.toLowerCase().trim();
    var N = pool.length;
    if (N === 0) return { colour: { name: 'Unknown', hex: '#808080', src: '' }, similarity: 0 };
    var M = POEM_MEASURES.length;

    // Step 1: Compute distances (M measures × N candidates)
    var distances = new Array(N);
    for (var i = 0; i < N; i++) {
      var name = pool[i].name.toLowerCase();
      distances[i] = new Array(M);
      for (var m = 0; m < M; m++) {
        distances[i][m] = POEM_MEASURES[m](query, name);
      }
    }

    // Step 2: Prune — keep candidates in top 50% of ANY measure
    var cutoff = Math.ceil(N * POEM_PRUNE_PCT);
    var survivors = new Set();
    for (var m = 0; m < M; m++) {
      var indices = [];
      for (var i = 0; i < N; i++) indices.push(i);
      indices.sort(function (a, b) { return distances[a][m] - distances[b][m]; });
      for (var r = 0; r < cutoff && r < indices.length; r++) {
        survivors.add(indices[r]);
      }
    }
    var candidates = Array.from(survivors);

    // Step 3: Pareto front — candidates not dominated by any other
    var dominated = new Set();
    for (var ci = 0; ci < candidates.length; ci++) {
      if (dominated.has(candidates[ci])) continue;
      for (var cj = 0; cj < candidates.length; cj++) {
        if (ci === cj) continue;
        var ii = candidates[ci], jj = candidates[cj];
        var allLeq = true, anyLt = false;
        for (var m = 0; m < M; m++) {
          if (distances[jj][m] > distances[ii][m]) { allLeq = false; break; }
          if (distances[jj][m] < distances[ii][m]) anyLt = true;
        }
        if (allLeq && anyLt) { dominated.add(ii); break; }
      }
    }
    var front = candidates.filter(function (i) { return !dominated.has(i); });

    // Step 4: Tiebreak within Pareto front by mean distance
    var bestMean = Infinity;
    var bestIdx = front[0];
    front.forEach(function (i) {
      var sum = 0;
      for (var m = 0; m < M; m++) sum += distances[i][m];
      if (sum / M < bestMean) { bestMean = sum / M; bestIdx = i; }
    });

    var bestColour = pool[bestIdx];
    var similarity = stringSimilarity(query, bestColour.name);

    // Rank all pool entries by mean POEM distance (for name scoring)
    var meanDists = new Array(N);
    for (var i = 0; i < N; i++) {
      var sum = 0;
      for (var m = 0; m < M; m++) sum += distances[i][m];
      meanDists[i] = sum / M;
    }
    var rankOrder = [];
    for (var i = 0; i < N; i++) rankOrder.push(i);
    rankOrder.sort(function (a, b) { return meanDists[a] - meanDists[b]; });
    var rankOf = {};
    for (var r = 0; r < N; r++) rankOf[rankOrder[r]] = r;

    return { colour: bestColour, similarity: similarity, pool: pool, rankOf: rankOf };
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
  const ROUNDS = 5;
  const MAX_ITER_GUESSES = 10;
  let state = {
    timing: 'daily',     // 'daily' or 'freeplay'
    type: 'classic',     // 'classic' or 'explore'
    palette: 'All',
    round: 0,
    colours: [],
    results: [],
    totalName: 0,
    totalHSB: 0,
    totalScore: 0,
    playing: false,
    // Explore mode state
    iterGuessCount: 0,
    iterBest: null,
    iterLast: null,
  };

  function getDailyNumber() {
    const epoch = new Date(2026, 2, 4); // local midnight, month 0-indexed
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - epoch) / 86400000) + 1;
  }

  function pickDailyColours() {
    var pool = getPool();
    const seed = hashString('colourdle-' + state.type + '-' + state.palette + '-' + getDailyNumber());
    const rng = mulberry32(seed);
    const picked = [];
    const used = new Set();
    while (picked.length < ROUNDS) {
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
  var WORKER_URL = 'https://colourdle-scores.aebrer.workers.dev';

  function loadStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function persistStorage(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) { /* storage full — game continues, data just won't persist */ }
  }

  function dailyKey(dayNum, palette, type) {
    // Backward-compatible: classic+All = just dayNum
    var key = String(dayNum);
    if (type === 'explore') key += ':explore';
    if (palette !== 'All') key += ':' + palette;
    return key;
  }

  function saveDaily(dayNum, palette, type, results, totals) {
    var store = loadStorage();
    if (!store.days) store.days = {};
    store.days[dailyKey(dayNum, palette, type)] = {
      palette: palette,
      type: type,
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
    persistStorage(store);
  }

  function getDailyResult(dayNum, palette, type) {
    var store = loadStorage();
    var key = dailyKey(dayNum, palette, type);
    return store.days && store.days[key] || null;
  }

  function savePercentile(dayNum, palette, type, percentile, total) {
    var store = loadStorage();
    if (!store.days) return;
    var key = dailyKey(dayNum, palette, type);
    if (store.days[key]) {
      store.days[key].percentile = percentile;
      store.days[key].percentileTotal = total;
      persistStorage(store);
    }
  }

  function fetchPercentile(key, score) {
    return fetch(WORKER_URL + '/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, score: score }),
    })
    .then(function (r) { return r.json(); })
    .catch(function () { return null; });
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
    if (state.timing === 'daily') {
      var saved = getDailyResult(getDailyNumber(), state.palette, state.type);
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
    if (state.timing === 'daily') {
      state.colours = pickDailyColours();
    } else {
      state.colours = [];
    }
    showRound();
  }

  function showRound() {
    let target;
    if (state.timing === 'daily') {
      target = state.colours[state.round];
    } else {
      target = pickRandomColour();
      state.colours.push(target);
    }

    const roundNum = state.round + 1;
    var total = state.timing === 'daily' ? ROUNDS : '\u221E';
    $('#round-counter').textContent = roundNum + ' / ' + total;
    $('#running-score').textContent = state.totalScore;
    $('#game-source').textContent = target.src;
    $('#guess-input').value = '';

    // Show finish button in freeplay after at least 1 round
    $('#btn-finish').style.display = (state.timing === 'freeplay' && state.round > 0) ? '' : 'none';

    // Reset explore state for this round
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
    // Name score: where does the target rank in POEM's consensus ordering?
    var nameScore = 0;
    if (match.pool && match.rankOf) {
      for (var i = 0; i < match.pool.length; i++) {
        if (match.pool[i].name === target.name) {
          var rank = match.rankOf[i]; // 0 = closest to guess
          nameScore = Math.round(Math.pow(1 - rank / (match.pool.length - 1), 2) * 100);
          break;
        }
      }
    }
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

    if (state.type === 'explore') {
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
        exploreDone();
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
    $('#result-guess-raw').textContent = result.guess;
    $('#result-guess-matched').textContent = result.matched.name;
    $('#result-guess-source').textContent = result.matched.src;
    $('#hint-hsb').textContent = 'How close is "' + result.matched.name + '" to the colour?';

    $('#score-name').textContent = result.nameScore;
    $('#score-hsb').textContent = result.hsbScore;
    $('#score-total').textContent = result.total;

    $('#score-name').className = 'score-val ' + scoreClass(result.nameScore, 100);
    $('#score-hsb').className = 'score-val ' + scoreClass(result.hsbScore, 100);
    $('#score-total').className = 'score-val ' + scoreClass(result.total, 200);

    var isLast = state.timing === 'daily' && state.round >= ROUNDS - 1;
    $('#btn-next').textContent = isLast ? 'Results' : 'Next';

    showScreen('result');
  }

  function exploreDone() {
    if (!state.iterBest) return;
    var best = state.iterBest;
    state.iterBest = null; // prevent double-fire
    best.guesses = state.iterGuessCount;
    state.results.push(best);
    state.totalName += best.nameScore;
    state.totalHSB += best.hsbScore;
    state.totalScore += best.total;

    // Show result screen with target reveal
    showResult(best);
  }

  function nextRound() {
    state.round++;
    if (state.timing === 'daily' && state.round >= ROUNDS) {
      showSummary();
    } else {
      showRound();
    }
  }

  function showSummary() {
    state.playing = false;

    if (state.timing === 'daily') {
      var dayNum = getDailyNumber();
      var suffix = '';
      var modeParts = [];
      if (state.type === 'explore') modeParts.push('Explore');
      if (state.palette !== 'All') modeParts.push(state.palette);
      if (modeParts.length) suffix = ' (' + modeParts.join(', ') + ')';
      $('#summary-title').textContent = 'Colourdle #' + dayNum + suffix;
      $('#btn-back').style.display = 'none';
      // Persist daily results
      if (!getDailyResult(dayNum, state.palette, state.type)) {
        saveDaily(dayNum, state.palette, state.type, state.results, {
          name: state.totalName,
          hsb: state.totalHSB,
          score: state.totalScore,
        });
      }
    } else {
      var label = 'Freeplay';
      if (state.type === 'explore') label += ' Explore';
      var count = state.results.length + ' round' + (state.results.length !== 1 ? 's' : '');
      if (state.type === 'explore') {
        var totalGuesses = state.results.reduce(function (sum, r) { return sum + (r.guesses || 1); }, 0);
        count += ', ' + totalGuesses + ' guesses';
      }
      $('#summary-title').textContent = label + ' \u2014 ' + count;
      $('#btn-back').style.display = 'none';
    }

    showSummaryContent();
    showScreen('summary');

    // Fetch or show cached percentile for daily games
    var pctEl = $('#percentile');
    pctEl.style.display = 'none';
    if (state.timing === 'daily') {
      if (isPerfectScore()) {
        // Perfect scores get a special message and are not submitted
        showPercentile(100, 0);
      } else {
        var dayNum = getDailyNumber();
        var saved = getDailyResult(dayNum, state.palette, state.type);
        if (saved && saved.percentile != null) {
          showPercentile(saved.percentile, saved.percentileTotal);
        } else {
          var key = dailyKey(dayNum, state.palette, state.type);
          fetchPercentile(key, state.totalScore).then(function (data) {
            if (data && data.total > 0) {
              savePercentile(dayNum, state.palette, state.type, data.percentile, data.total);
              showPercentile(data.percentile, data.total);
            }
          });
        }
      }
    }
  }

  function isPerfectScore() {
    return state.totalScore >= state.results.length * 200;
  }

  function showPercentile(percentile, total) {
    var pctEl = $('#percentile');
    if (isPerfectScore()) {
      pctEl.textContent = 'You are the best to ever do it.';
    } else if (total < 2) {
      pctEl.textContent = 'First score recorded today!';
    } else {
      var topPct = Math.max(1, 100 - percentile);
      var others = total - 1;
      var beaten = Math.min(others, Math.round(percentile * others / 100));
      var playerWord = others === 1 ? 'player' : 'players';
      pctEl.textContent = 'Top ' + topPct + '% (you beat ' + beaten + ' of ' + others + ' ' + playerWord + ')';
    }
    pctEl.style.display = '';
  }

  // ----------------------------------------------------------
  // History
  // ----------------------------------------------------------
  var viewingHistory = false;

  function parseHistoryKey(key) {
    // Keys: "2", "2:Crayola", "2:explore", "2:explore:Crayola"
    var parts = key.split(':');
    var dayNum = parseInt(parts[0], 10);
    var type = 'classic';
    var palette = 'All';
    for (var i = 1; i < parts.length; i++) {
      if (parts[i] === 'explore') type = 'explore';
      else palette = parts[i];
    }
    return { dayNum: dayNum, palette: palette, type: type };
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
      var maxScore = day.results.length * 100;
      var row = el('button', 'history-row');

      var labelText = '#' + info.dayNum;
      var tags = [];
      if (info.type === 'explore') tags.push('Explore');
      if (info.palette !== 'All') tags.push(info.palette);
      if (tags.length) labelText += ' (' + tags.join(', ') + ')';
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
    state.type = info.type;
    state.timing = 'daily';

    var suffix = '';
    var tags = [];
    if (info.type === 'explore') tags.push('Explore');
    if (info.palette !== 'All') tags.push(info.palette);
    if (tags.length) suffix = ' (' + tags.join(', ') + ')';
    var realKey = dailyKey(getDailyNumber(), state.palette, state.type);
    $('#summary-title').textContent = 'Colourdle #' + info.dayNum + suffix;
    $('#btn-back').style.display = key !== realKey ? '' : 'none';
    showSummaryContent();
    showScreen('summary');

    // Show cached percentile for history views
    var pctEl = $('#percentile');
    pctEl.style.display = 'none';
    if (saved.percentile != null) {
      showPercentile(saved.percentile, saved.percentileTotal);
    }
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

      var score = el('div', 'summary-score ' + scoreClass(r.total, 100), String(r.total));

      row.appendChild(swatch);
      row.appendChild(nameWrap);
      row.appendChild(score);
      roundsEl.appendChild(row);
    });

    var maxName = state.results.length * 100;
    var maxHSB = state.results.length * 100;
    var maxTotal = state.results.length * 100;

    var totalsEl = $('#summary-totals');
    totalsEl.textContent = '';

    [
      ['Name', state.totalName, maxName],
      ['Colour', state.totalHSB, maxHSB],
      ['Final', state.totalScore, maxTotal],
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
    var title = $('#summary-title').textContent;

    var emojiGrid = state.results
      .map(function (r) {
        var line = scoreEmoji(r.nameScore, 100) + scoreEmoji(r.hsbScore, 100);
        if (r.guesses) line += ' (' + r.guesses + ')';
        return line;
      })
      .join('\n');

    var maxScore = state.results.length * 100;

    // Build share URL with query params
    var params = [];
    if (state.palette !== 'All') params.push('palette=' + encodeURIComponent(state.palette));
    if (state.type !== 'classic') params.push('type=' + state.type);
    if (state.timing !== 'daily') params.push('timing=' + state.timing);
    var shareUrl = 'https://colourdle.ca' + (params.length ? '?' + params.join('&') : '');

    var scoreLine = 'Score: ' + state.totalScore + '/' + maxScore;

    // Include percentile if available
    var pctText = $('#percentile').textContent;
    if (pctText && $('#percentile').style.display !== 'none') {
      scoreLine += ' (' + pctText + ')';
    }

    return title + '\n' + emojiGrid + '\n' + scoreLine + '\n' + shareUrl;
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
    }).catch(function () {
      // Fallback: select from a temporary textarea
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
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

  $('#btn-done').addEventListener('click', exploreDone);

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

  // Timing selector: Daily / Freeplay
  function setTiming(timing) {
    state.timing = timing;
    $('#btn-daily').classList.toggle('active', timing === 'daily');
    $('#btn-freeplay').classList.toggle('active', timing === 'freeplay');
    resetTheme();
    renderHistory();
  }

  // Type selector: Classic / Explore
  function setType(type) {
    state.type = type;
    $('#btn-classic').classList.toggle('active', type === 'classic');
    $('#btn-explore').classList.toggle('active', type === 'explore');
    resetTheme();
    renderHistory();
  }

  $('#btn-daily').addEventListener('click', function () { setTiming('daily'); });
  $('#btn-freeplay').addEventListener('click', function () { setTiming('freeplay'); });
  $('#btn-classic').addEventListener('click', function () { setType('classic'); });
  $('#btn-explore').addEventListener('click', function () { setType('explore'); });

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
    persistStorage(store);
  }

  $('#btn-theme').addEventListener('click', function () {
    applyDarkMode(!isDark());
  });

  // Palette resets to "All" each session — no persistence

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  (function () {
    // Parse URL query params for shared links
    var params = new URLSearchParams(window.location.search);
    if (params.has('palette')) {
      $('#palette').value = params.get('palette');
      state.palette = $('#palette').value; // read back for validation
    }
    if (params.has('type') && (params.get('type') === 'classic' || params.get('type') === 'explore')) {
      state.type = params.get('type');
      setType(state.type);
    }
    if (params.has('timing') && (params.get('timing') === 'daily' || params.get('timing') === 'freeplay')) {
      state.timing = params.get('timing');
      setTiming(state.timing);
    }

    var store = loadStorage();
    var prefersDark = store.dark != null ? store.dark : window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyDarkMode(prefersDark);
  })();
  renderHistory();

})();
