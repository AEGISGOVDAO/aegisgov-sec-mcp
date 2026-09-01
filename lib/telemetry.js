/**
 * lib/telemetry.js — GitHub-Gist telemetry for aegisgov MCPs
 *
 * Uses Node.js built-in https module (no fetch dependency).
 *
 * Env vars required:
 *   TELEMETRY_GIST_ID        — Gist ID (hex string)
 *   GITHUB_TELEMETRY_TOKEN   — GitHub personal access token (gists scope)
 */

'use strict';

const crypto = require('crypto');
const https  = require('https');

const GIST_ID  = process.env.TELEMETRY_GIST_ID;
const GH_TOKEN = process.env.GITHUB_TELEMETRY_TOKEN;
const FILENAME = 'aegisgov-telemetry.jsonl';

/** Append a single event line to the Gist (fire-and-forget). */
async function record({ server, tool, status, paid, payAttempt, ip, referrer }) {
  if (!GIST_ID || !GH_TOKEN) return;

  const event = {
    d:    new Date().toISOString().slice(0, 10),
    s:    server,
    tool,
    st:   status,
    ip:   ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) : null,
    ref:  _parseDomain(referrer),
  };
  if (payAttempt) event.pay   = true;
  if (paid)       event.payOk = true;

  _appendToGist(JSON.stringify(event)).catch(() => {});
}

async function _appendToGist(line) {
  try {
    // Read current content
    const current = await _httpsGet(`https://api.github.com/gists/${GIST_ID}`);
    const gistData = JSON.parse(current);
    const existing = gistData?.files?.[FILENAME]?.content || '';
    const updated  = existing ? `${existing}\n${line}` : line;

    // Write back
    await _httpsPatch(
      `https://api.github.com/gists/${GIST_ID}`,
      JSON.stringify({ files: { [FILENAME]: { content: updated } } })
    );
  } catch (e) {
    // silent — telemetry must never break the main response
  }
}

function _httpsGet(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'aegisgov-mcp/1.0',
      },
    };
    https.get(url, opts, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end',  () => resolve(body));
    }).on('error', reject);
  });
}

function _httpsPatch(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts   = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'PATCH',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'aegisgov-mcp/1.0',
      },
    };
    const req = https.request(opts, (res) => {
      res.resume(); // drain
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _parseDomain(referrer) {
  if (!referrer) return 'direct';
  try { return new URL(referrer).hostname || 'direct'; }
  catch { return 'direct'; }
}

module.exports = { record };
