const ALLOWED_ORIGINS = [
  'https://krupteaching.github.io',
  'http://localhost:7788',
  'http://127.0.0.1:7788',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) || (origin && origin.startsWith('http://localhost')) || (origin && origin.startsWith('http://127.0.0.1'));
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url    = new URL(request.url);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // POST /score — upsert best score for player + stage
    if (request.method === 'POST' && url.pathname === '/score') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'invalid JSON' }, 400, origin); }

      const { player_name, stage_id, stage_name, tense, score, badge, pct } = body;

      if (!player_name || typeof player_name !== 'string' || player_name.trim().length === 0) {
        return json({ error: 'player_name required' }, 400, origin);
      }
      if (!Number.isInteger(stage_id) || stage_id < 1 || stage_id > 16) {
        return json({ error: 'stage_id must be 1-16' }, 400, origin);
      }
      if (typeof score !== 'number' || score < 0) {
        return json({ error: 'score must be non-negative number' }, 400, origin);
      }

      const name  = player_name.trim().slice(0, 12);
      const now   = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO scores (player_name, stage_id, stage_name, tense, score, badge, pct, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_name, stage_id) DO UPDATE SET
          score        = excluded.score,
          badge        = excluded.badge,
          pct          = excluded.pct,
          submitted_at = excluded.submitted_at
        WHERE excluded.score > scores.score
      `).bind(
        name,
        stage_id,
        stage_name || '',
        tense      || '',
        score,
        badge      || 'bronze',
        pct        || 0,
        now
      ).run();

      return json({ ok: true }, 200, origin);
    }

    // GET /leaderboard?type=overall&limit=20
    // GET /leaderboard?type=stage&stage=5&limit=20
    if (request.method === 'GET' && url.pathname === '/leaderboard') {
      const type  = url.searchParams.get('type')  || 'overall';
      const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10));

      if (type === 'overall') {
        const { results } = await env.DB.prepare(`
          SELECT
            player_name,
            SUM(score)  AS total_score,
            COUNT(*)    AS stages_cleared,
            SUM(CASE WHEN badge = 'gold'   THEN 1 ELSE 0 END) AS gold_count,
            SUM(CASE WHEN badge = 'silver' THEN 1 ELSE 0 END) AS silver_count,
            SUM(CASE WHEN badge = 'bronze' THEN 1 ELSE 0 END) AS bronze_count
          FROM   scores
          GROUP  BY player_name
          ORDER  BY total_score DESC, stages_cleared DESC
          LIMIT  ?
        `).bind(limit).all();

        return json({ type: 'overall', rows: results || [] }, 200, origin);
      }

      if (type === 'stage') {
        const stageId = parseInt(url.searchParams.get('stage') || '0', 10);
        if (stageId < 1 || stageId > 16) {
          return json({ error: 'stage must be 1-16' }, 400, origin);
        }
        const { results } = await env.DB.prepare(`
          SELECT player_name, score, badge, pct, submitted_at
          FROM   scores
          WHERE  stage_id = ?
          ORDER  BY score DESC, pct DESC
          LIMIT  ?
        `).bind(stageId, limit).all();

        return json({ type: 'stage', stage_id: stageId, rows: results || [] }, 200, origin);
      }

      return json({ error: 'type must be overall or stage' }, 400, origin);
    }

    return json({ error: 'not found' }, 404, origin);
  }
};
