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
  // Utility: Colour conversions
  // ----------------------------------------------------------
  function hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function rgbToHSB(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h, s, v;
    v = max;
    s = max === 0 ? 0 : d / max;

    if (d === 0) {
      h = 0;
    } else if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / d + 2) * 60;
    } else {
      h = ((r - g) / d + 4) * 60;
    }

    return { h, s: s * 100, b: v * 100 };
  }

  function hexToHSB(hex) {
    const { r, g, b } = hexToRGB(hex);
    return rgbToHSB(r, g, b);
  }

  // ----------------------------------------------------------
  // Scoring: HSB distance (0 = identical, 1 = max distance)
  // ----------------------------------------------------------
  function hsbDistance(hsb1, hsb2) {
    const hueDiff = Math.min(
      Math.abs(hsb1.h - hsb2.h),
      360 - Math.abs(hsb1.h - hsb2.h)
    );
    const satDiff = Math.abs(hsb1.s - hsb2.s);
    const briDiff = Math.abs(hsb1.b - hsb2.b);

    const hN = hueDiff / 180;
    const sN = satDiff / 100;
    const bN = briDiff / 100;

    return Math.sqrt(hN * hN + sN * sN + bN * bN) / Math.sqrt(3);
  }

  // ----------------------------------------------------------
  // Scoring: Fuzzy string similarity (Levenshtein-based, 0-100)
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
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
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
    const dist = levenshtein(a, b);
    return Math.round((1 - dist / maxLen) * 100);
  }

  // ----------------------------------------------------------
  // Colour DB: find best fuzzy match for a guess
  // ----------------------------------------------------------
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
  // Safe DOM helpers
  // ----------------------------------------------------------
  function el(tag, className, textContent) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (textContent != null) e.textContent = textContent;
    return e;
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

  // ----------------------------------------------------------
  // Daily: pick colours using date seed
  // ----------------------------------------------------------
  function getDailyNumber() {
    const epoch = new Date('2026-03-04');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - epoch) / 86400000) + 1;
  }

  function pickDailyColours() {
    const dayNum = getDailyNumber();
    const seed = hashString('colourdle-' + dayNum);
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
    const idx = Math.floor(Math.random() * COLOURS.length);
    return COLOURS[idx];
  }

  // ----------------------------------------------------------
  // Score display helpers
  // ----------------------------------------------------------
  function scoreClass(score, max) {
    const pct = score / max;
    if (pct >= 0.7) return 'score-great';
    if (pct >= 0.4) return 'score-good';
    return 'score-poor';
  }

  function scoreEmoji(score, max) {
    const pct = score / max;
    if (pct >= 0.85) return '🟩';
    if (pct >= 0.6) return '🟨';
    if (pct >= 0.35) return '🟧';
    return '🟥';
  }

  // ----------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const screens = {
    start: $('#screen-start'),
    game: $('#screen-game'),
    result: $('#screen-result'),
    summary: $('#screen-summary'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ----------------------------------------------------------
  // Game flow
  // ----------------------------------------------------------
  function startGame() {
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
    $('#running-score').textContent = 'Score: ' + state.totalScore;
    $('#colour-swatch').style.backgroundColor = target.hex;
    $('#guess-input').value = '';

    showScreen('game');
    setTimeout(() => $('#guess-input').focus(), 100);
  }

  function submitGuess() {
    const input = $('#guess-input').value.trim();
    if (!input) return;

    const target = state.colours[state.round];
    const match = findBestMatch(input);

    // Name score: similarity between input text and target's actual name
    const nameScore = stringSimilarity(input, target.name);

    // HSB score: proximity of matched colour to target
    const targetHSB = hexToHSB(target.hex);
    const guessHSB = hexToHSB(match.colour.hex);
    const dist = hsbDistance(targetHSB, guessHSB);
    const hsbScore = Math.round((1 - dist) * 100);

    const roundTotal = nameScore + hsbScore;

    state.results.push({
      target,
      guess: input,
      matched: match.colour,
      matchSimilarity: match.similarity,
      nameScore,
      hsbScore,
      total: roundTotal,
    });

    state.totalName += nameScore;
    state.totalHSB += hsbScore;
    state.totalScore += roundTotal;

    showResult(state.results[state.results.length - 1]);
  }

  function showResult(result) {
    $('#result-target').style.backgroundColor = result.target.hex;
    $('#result-target-name').textContent = result.target.name;
    $('#result-target-source').textContent = result.target.src;
    $('#result-guess').style.backgroundColor = result.matched.hex;
    $('#result-guess-name').textContent = '"' + result.guess + '" \u2192 ' + result.matched.name;
    $('#result-guess-source').textContent = result.matched.src;
    $('#hint-hsb').textContent = 'How close is "' + result.matched.name + '" to the colour?';

    const barName = $('#bar-name');
    const barHSB = $('#bar-hsb');
    const barTotal = $('#bar-total');
    const valName = $('#score-name');
    const valHSB = $('#score-hsb');
    const valTotal = $('#score-total');

    barName.style.width = '0%';
    barHSB.style.width = '0%';
    barTotal.style.width = '0%';

    showScreen('result');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        barName.style.width = result.nameScore + '%';
        barHSB.style.width = result.hsbScore + '%';
        barTotal.style.width = (result.total / 2) + '%';

        valName.textContent = result.nameScore;
        valHSB.textContent = result.hsbScore;
        valTotal.textContent = result.total;

        valName.className = 'score-value ' + scoreClass(result.nameScore, 100);
        valHSB.className = 'score-value ' + scoreClass(result.hsbScore, 100);
        valTotal.className = 'score-value ' + scoreClass(result.total, 200);
      });
    });

    const isLast = state.mode === 'daily' && state.round >= ROUNDS_DAILY - 1;
    $('#btn-next').textContent = isLast ? 'See Results' : 'Next';
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
    const roundsEl = $('#summary-rounds');
    roundsEl.textContent = '';

    state.results.forEach((r) => {
      const row = el('div', 'summary-round');

      const swatch = el('div', 'summary-swatch');
      swatch.style.backgroundColor = r.target.hex;

      const nameWrap = el('div', 'summary-name');
      nameWrap.appendChild(el('div', 'summary-target-name', r.target.name));
      nameWrap.appendChild(el('div', 'summary-source', r.target.src));
      nameWrap.appendChild(el('div', 'summary-guess-name', r.guess + ' \u2192 ' + r.matched.name));

      const score = el('div', 'summary-score ' + scoreClass(r.total, 200), String(r.total));

      row.appendChild(swatch);
      row.appendChild(nameWrap);
      row.appendChild(score);
      roundsEl.appendChild(row);
    });

    const maxName = state.results.length * 100;
    const maxHSB = state.results.length * 100;
    const maxTotal = state.results.length * 200;

    const totalsEl = $('#summary-totals');
    totalsEl.textContent = '';

    [
      ['Name', state.totalName, maxName],
      ['Colour', state.totalHSB, maxHSB],
      ['Total', state.totalScore, maxTotal],
    ].forEach(([label, value, max]) => {
      const item = el('div', 'summary-total-item');
      item.appendChild(el('div', 'summary-total-label', label));
      item.appendChild(el('div', 'summary-total-value ' + scoreClass(value, max), value + '/' + max));
      totalsEl.appendChild(item);
    });

    if (state.mode === 'daily') {
      $('#summary-title').textContent = 'Colourdle #' + getDailyNumber();
    } else {
      $('#summary-title').textContent = 'Infinite Mode \u2014 ' + state.results.length + ' rounds';
    }

    showScreen('summary');
  }

  // ----------------------------------------------------------
  // Share
  // ----------------------------------------------------------
  function generateShareText() {
    const dayNum = state.mode === 'daily' ? getDailyNumber() : null;
    const title = dayNum
      ? 'Colourdle #' + dayNum
      : 'Colourdle Infinite (' + state.results.length + ' rounds)';

    const emojiGrid = state.results
      .map((r) => scoreEmoji(r.nameScore, 100) + scoreEmoji(r.hsbScore, 100))
      .join('\n');

    const maxTotal = state.results.length * 200;

    return title + '\n' + emojiGrid + '\nScore: ' + state.totalScore + '/' + maxTotal;
  }

  function share() {
    const text = generateShareText();

    if (navigator.share) {
      navigator.share({ text: text }).catch(() => copyToClipboard(text));
    } else {
      copyToClipboard(text);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      const toast = $('#share-toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    });
  }

  // ----------------------------------------------------------
  // Event listeners
  // ----------------------------------------------------------
  $('#btn-start').addEventListener('click', startGame);
  $('#btn-guess').addEventListener('click', submitGuess);
  $('#btn-next').addEventListener('click', nextRound);
  $('#btn-share').addEventListener('click', share);
  $('#btn-play-again').addEventListener('click', () => {
    showScreen('start');
  });

  $('#guess-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitGuess();
  });

  $('#btn-daily').addEventListener('click', () => {
    state.mode = 'daily';
    $('#btn-daily').classList.add('active');
    $('#btn-infinite').classList.remove('active');
    showScreen('start');
  });

  $('#btn-infinite').addEventListener('click', () => {
    state.mode = 'infinite';
    $('#btn-infinite').classList.add('active');
    $('#btn-daily').classList.remove('active');
    showScreen('start');
  });

})();
