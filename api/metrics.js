/**
 * GET /metrics — funnel metrics for aegisgov-sec-mcp
 * Same logic as contracts; filters on server='sec'.
 */

'use strict';

const SERVER   = 'sec';
const GIST_ID  = process.env.TELEMETRY_GIST_ID;
const GH_TOKEN = process.env.GITHUB_TELEMETRY_TOKEN;
const FILENAME = 'aegisgov-telemetry.jsonl';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

  if (!GIST_ID || !GH_TOKEN) {
    return res.json({ ok: false, error: 'Telemetry not configured (missing TELEMETRY_GIST_ID or GITHUB_TELEMETRY_TOKEN)' });
  }

  try {
    const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'aegisgov-mcp/1.0',
      },
    });
    if (!gistRes.ok) {
      return res.status(502).json({ ok: false, error: `Gist read failed: ${gistRes.status}` });
    }
    const gist    = await gistRes.json();
    const content = gist?.files?.[FILENAME]?.content || '';
    const lines   = content.split('\n').filter(l => l.trim().startsWith('{'));
    const events  = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    return res.json(aggregate(events, SERVER));
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

function aggregate(events, server) {
  const now      = new Date();
  const today    = now.toISOString().slice(0, 10);
  const cutoff14 = new Date(now); cutoff14.setUTCDate(cutoff14.getUTCDate() - 14);
  const cut14Str = cutoff14.toISOString().slice(0, 10);

  const mine = events.filter(e => e.s === server);

  const toolTotals14d = {};
  const toolTotals24h = {};
  const ips  = new Set();
  const refs = {};
  let http402_14d = 0, http402_24h = 0;
  let payAtt14d = 0,  payAtt24h  = 0;
  let payOk14d  = 0,  payOk24h   = 0;

  for (const e of mine) {
    if (e.d < cut14Str) continue;
    const in24h = e.d === today;

    if (e.tool) {
      toolTotals14d[e.tool] = (toolTotals14d[e.tool] || 0) + 1;
      if (in24h) toolTotals24h[e.tool] = (toolTotals24h[e.tool] || 0) + 1;
    }
    if (e.st === 402) { http402_14d++; if (in24h) http402_24h++; }
    if (e.pay)   { payAtt14d++; if (in24h) payAtt24h++; }
    if (e.payOk) { payOk14d++;  if (in24h) payOk24h++;  }
    if (e.ip) ips.add(e.ip);
    const ref = e.ref || 'direct';
    refs[ref] = (refs[ref] || 0) + 1;
  }

  const calls14d = Object.values(toolTotals14d).reduce((s, v) => s + v, 0);
  const calls24h = Object.values(toolTotals24h).reduce((s, v) => s + v, 0);

  return {
    ok:     true,
    server: 'aegisgov-sec-mcp',
    asOf:   new Date().toISOString(),
    totalEvents: mine.length,
    funnel: {
      calls: { last24h: calls24h, last14d: calls14d, byTool14d: toolTotals14d, byTool24h: toolTotals24h },
      topTools: Object.entries(toolTotals14d).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count})),
      http402: { last14d: http402_14d, last24h: http402_24h },
      payments: {
        attempts14d: payAtt14d, attempts24h: payAtt24h,
        successes14d: payOk14d, successes24h: payOk24h,
        conversionRate: payAtt14d > 0 ? `${((payOk14d/payAtt14d)*100).toFixed(1)}%` : 'N/A',
      },
      uniqueClients: ips.size,
      topSources: Object.entries(refs).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count})),
    },
  };
}
