/**
 * lib/telemetry.js — GitHub-Gist telemetry for aegisgov MCPs
 *
 * Events are appended as JSONL to a GitHub Gist (fire-and-forget).
 * The /metrics endpoint reads and aggregates the Gist.
 *
 * Env vars required:
 *   TELEMETRY_GIST_ID     — Gist ID (hex string)
 *   GITHUB_TELEMETRY_TOKEN — GitHub personal access token (gists scope)
 *
 * Schema (one JSON line per event):
 *   { d, s, tool, st, pay, payOk, ip, ref }
 *   d     = YYYY-MM-DD (UTC date)
 *   s     = server id ('contracts' | 'sec')
 *   tool  = tool name
 *   st    = HTTP status code
 *   pay   = true if payment challenge was issued (402)
 *   payOk = true if payment was verified
 *   ip    = hashed IP (first 16 hex chars of sha256)
 *   ref   = referrer domain or 'direct'
 */

'use strict';

const crypto = require('crypto');

const GIST_ID = process.env.TELEMETRY_GIST_ID;
const GH_TOKEN = process.env.GITHUB_TELEMETRY_TOKEN;
const FILENAME = 'aegisgov-telemetry.jsonl';
const GH_API = 'https://api.github.com';

/** Append a single event line to the Gist (fire-and-forget). */
async function record({ server, tool, status, paid, payAttempt, ip, referrer }) {
  if (!GIST_ID || !GH_TOKEN) return; // no-op if not configured

  const event = {
    d:     new Date().toISOString().slice(0, 10),
    s:     server,
    tool,
    st:    status,
    ip:    ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) : null,
    ref:   _parseDomain(referrer),
  };
  if (payAttempt) event.pay   = true;
  if (paid)       event.payOk = true;

  _appendToGist(JSON.stringify(event)).catch(() => {}); // non-blocking
}

/** Append a newline-delimited JSON event to the Gist. */
async function _appendToGist(line) {
  // Read current content
  const readRes = await fetch(`${GH_API}/gists/${GIST_ID}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'aegisgov-mcp/1.0',
    },
  });

  if (!readRes.ok) return; // bail silently on read error

  const gist    = await readRes.json();
  const current = gist?.files?.[FILENAME]?.content || '';
  const updated = current ? `${current}\n${line}` : line;

  // Write back
  await fetch(`${GH_API}/gists/${GIST_ID}`, {
    method:  'PATCH',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'aegisgov-mcp/1.0',
    },
    body: JSON.stringify({ files: { [FILENAME]: { content: updated } } }),
  });
}

function _parseDomain(referrer) {
  if (!referrer) return 'direct';
  try { return new URL(referrer).hostname || 'direct'; }
  catch { return 'direct'; }
}

module.exports = { record };
