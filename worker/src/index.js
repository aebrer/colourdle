// Colourdle Percentile Worker
// Stores anonymous daily scores and returns percentile rank.
//
// POST /score  { key: "2:Crayola", score: 312 }
//   -> { percentile: 73, total: 41 }
//
// GET  /score?key=2:Crayola&score=312
//   -> { percentile: 73, total: 41 }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS headers
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // Also allow localhost for dev
    if (origin && origin.startsWith('http://localhost')) {
      cors['Access-Control-Allow-Origin'] = origin;
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    try {
      if (url.pathname === '/score') {
        let key, score;

        if (request.method === 'POST') {
          const body = await request.json();
          key = body.key;
          score = body.score;
        } else if (request.method === 'GET') {
          key = url.searchParams.get('key');
          score = Number(url.searchParams.get('score'));
        } else {
          return json({ error: 'Method not allowed' }, 405);
        }

        if (!key || typeof key !== 'string' || key.length > 100) {
          return json({ error: 'Invalid key' }, 400);
        }
        score = Math.round(Number(score));
        if (isNaN(score) || score < 0 || score > 10000) {
          return json({ error: 'Invalid score' }, 400);
        }

        // KV key: "day:<key>" stores a JSON array of scores
        const kvKey = 'day:' + key;
        const raw = await env.SCORES.get(kvKey);
        let scores = raw ? JSON.parse(raw) : [];

        // For POST: add the score
        if (request.method === 'POST') {
          scores.push(score);
          await env.SCORES.put(kvKey, JSON.stringify(scores), {
            // Auto-expire after 48 hours (covers all timezones)
            expirationTtl: 60 * 60 * 48,
          });
        }

        // Calculate percentile
        const total = scores.length;
        if (total === 0) {
          return json({ percentile: 50, total: 0 });
        }
        const below = scores.filter(s => s < score).length;
        const equal = scores.filter(s => s === score).length;
        // Percentile: % of scores strictly below + half of equal scores
        const percentile = Math.round(((below + equal * 0.5) / total) * 100);

        return json({ percentile, total });
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error('Worker error:', e.message);
      return json({ error: 'Internal error' }, 500);
    }
  },
};
