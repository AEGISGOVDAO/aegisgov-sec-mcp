/**
 * lib/telemetry.js — Upstash Redis telemetry for aegisgov MCPs
 *
 * Schema (all keys prefixed by server ID):
 *   {srv}:call:{date}:{tool}    → INCR daily call count per tool  (TTL 16d)
 *   {srv}:tools                 → ZINCRBY sorted set — all-time tool rankings
 *   {srv}:status:{date}:{code}  → INCR daily status code counts   (TTL 16d)
 *   {srv}:pay:attempt:{date}    → INCR daily payment challenges    (TTL 16d)
 *   {srv}:pay:success:{date}    → INCR daily payment successes     (TTL 16d)
 *   {srv}:ips                   → SADD hashed IPs (lifetime unique clients)
 *   {srv}:refs                  → ZINCRBY referrer domain rankings (all-time)
 *
 * All writes are fire-and-forget — never block a response.
 */

'use strict';

const crypto = require('crypto');

const UPSTASH_URL   = process.env.UPSTASH_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_TOKEN;
const TTL_16D = 1382400; // 16 days in seconds

/** POST a pipeline of Redis commands to Upstash REST API. */
async function pipeline(cmds) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return; // no-op if not configured
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) {
      console.warn('[telemetry] Upstash pipeline error:', res.status);
    }
  } catch (err) {
    console.warn('[telemetry] Upstash write failed:', err.message);
  }
}

/**
 * Record a single MCP/REST event.
 *
 * @param {object} opts
 * @param {string} opts.server      Server ID (e.g. 'contracts' | 'sec')
 * @param {string} opts.tool        Tool/endpoint name
 * @param {number} opts.status      HTTP status code (200, 402, 500, …)
 * @param {boolean} [opts.paid]     True if payment was verified this call
 * @param {boolean} [opts.payAttempt] True if a 402 challenge was issued
 * @param {string} [opts.ip]        Raw client IP (will be hashed)
 * @param {string} [opts.referrer]  HTTP Referer header value
 */
async function record({ server, tool, status, paid, payAttempt, ip, referrer }) {
  const date    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const ipHash  = ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) : null;
  const refDomain = _parseDomain(referrer);

  const cmds = [];

  // ── Tool call count ────────────────────────────────────────────────────
  if (tool) {
    cmds.push(['INCR',    `${server}:call:${date}:${tool}`]);
    cmds.push(['EXPIRE',  `${server}:call:${date}:${tool}`, TTL_16D]);
    cmds.push(['ZINCRBY', `${server}:tools`, 1, tool]);
  }

  // ── HTTP status code ───────────────────────────────────────────────────
  const codeKey = `${server}:status:${date}:${status}`;
  cmds.push(['INCR',   codeKey]);
  cmds.push(['EXPIRE', codeKey, TTL_16D]);

  // ── Payment events ─────────────────────────────────────────────────────
  if (payAttempt) {
    const k = `${server}:pay:attempt:${date}`;
    cmds.push(['INCR', k]);
    cmds.push(['EXPIRE', k, TTL_16D]);
  }
  if (paid) {
    const k = `${server}:pay:success:${date}`;
    cmds.push(['INCR', k]);
    cmds.push(['EXPIRE', k, TTL_16D]);
  }

  // ── Unique IPs ─────────────────────────────────────────────────────────
  if (ipHash) {
    cmds.push(['SADD', `${server}:ips`, ipHash]);
  }

  // ── Referrer / discovery source ────────────────────────────────────────
  if (refDomain) {
    cmds.push(['ZINCRBY', `${server}:refs`, 1, refDomain]);
  }

  if (cmds.length > 0) {
    pipeline(cmds).catch(() => {}); // fire-and-forget
  }
}

/** Extract hostname from a referrer URL, falling back to 'direct'. */
function _parseDomain(referrer) {
  if (!referrer) return 'direct';
  try {
    const url = new URL(referrer);
    return url.hostname || 'direct';
  } catch {
    return 'direct';
  }
}

module.exports = { record };
