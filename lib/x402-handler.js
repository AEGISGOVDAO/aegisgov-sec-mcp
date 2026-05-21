// x402 payment enforcement — Vercel serverless (x402 v2)
const { x402ResourceServer, x402HTTPResourceServer, HTTPFacilitatorClient } = require('@x402/core/server');
const { registerExactEvmScheme } = require('@x402/evm/exact/server');

const WALLET = process.env.WALLET_ADDRESS;
const NETWORK = process.env.X402_NETWORK || 'eip155:84532';
const FACILITATOR_URL = process.env.X402_FACILITATOR || 'https://x402.org/facilitator';

const _httpServers = {};

class VercelAdapter {
  constructor(req) { this.req = req; }
  getHeader(name) { const v = this.req.headers[name.toLowerCase()]; return Array.isArray(v) ? v[0] : v; }
  getMethod() { return (this.req.method || 'POST').toUpperCase(); }
  getPath() { return (this.req.url || '/').split('?')[0]; }
  getUrl() { return `https://${this.req.headers.host || 'aegisgov-sec-mcp.vercel.app'}${this.req.url || '/'}`; }
  getAcceptHeader() { return this.getHeader('accept') || '*/*'; }
  getUserAgent() { return this.getHeader('user-agent') || ''; }
}

async function getHTTPServer(price, path) {
  const key = `${NETWORK}_${price}_${path}`;
  if (_httpServers[key]) return _httpServers[key];
  const routes = {
    [`POST ${path}`]: {
      accepts: { scheme: 'exact', price, network: NETWORK, payTo: WALLET },
      description: `AegisGov SEC Intelligence — ${price} USDC`,
    },
  };
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const rs = new x402ResourceServer([facilitator]);
  registerExactEvmScheme(rs);
  await rs.initialize();
  const httpServer = new x402HTTPResourceServer(rs, routes);
  _httpServers[key] = httpServer;
  return httpServer;
}

async function requirePayment(req, res, price) {
  if (process.env.DEMO_MODE === 'true') return true;
  const path = (req.url || '/').split('?')[0] || '/';
  try {
    const httpServer = await getHTTPServer(price, path);
    const adapter = new VercelAdapter(req);
    const paymentHeader = req.headers['payment-signature'] || req.headers['x-payment'];
    const result = await httpServer.processHTTPRequest({ adapter, path, method: req.method || 'POST', paymentHeader });
    if (result.type === 'no-payment-required' || result.type === 'payment-verified') return true;
    if (result.type === 'payment-error') {
      const { response } = result;
      res.status(response.status || 402);
      Object.entries(response.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
      res.json(response.body || { error: 'Payment required', docs: 'https://aegisgov.ai/sec-mcp' });
      return false;
    }
    return false;
  } catch (e) {
    console.error('[x402]', e.message);
    res.status(500).json({ error: 'Payment processing error' });
    return false;
  }
}

module.exports = { requirePayment };
