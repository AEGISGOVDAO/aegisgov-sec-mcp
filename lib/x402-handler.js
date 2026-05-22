// x402 payment enforcement — Vercel serverless
// Supports: EVM (Base mainnet) + Solana via PayAI facilitator
const { x402ResourceServer, x402HTTPResourceServer, HTTPFacilitatorClient } = require('@x402/core/server');
const { registerExactEvmScheme } = require('@x402/evm/exact/server');
const { registerExactSvmScheme } = require('@x402/svm/exact/server');

const EVM_WALLET = process.env.WALLET_ADDRESS;
const SOL_WALLET = process.env.SOLANA_WALLET_ADDRESS;

const EVM_NETWORK = process.env.X402_NETWORK || 'eip155:8453';
const SOL_NETWORK = process.env.X402_SOL_NETWORK || 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

// PayAI facilitator — free tier, supports Base mainnet + Solana mainnet
const FACILITATOR_URL = process.env.X402_FACILITATOR || 'https://facilitator.payai.network';

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
  const key = `${EVM_NETWORK}_${SOL_NETWORK}_${price}_${path}`;
  if (_httpServers[key]) return _httpServers[key];

  const accepts = [
    { scheme: 'exact', price, network: EVM_NETWORK, payTo: EVM_WALLET },
  ];

  if (SOL_WALLET) {
    accepts.push({ scheme: 'exact', price, network: SOL_NETWORK, payTo: SOL_WALLET });
  }

  const routes = {
    [`POST ${path}`]: {
      accepts,
      description: `AegisGov SEC Intelligence — ${price} USDC`,
    },
  };

  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const rs = new x402ResourceServer([facilitator]);
  registerExactEvmScheme(rs);
  registerExactSvmScheme(rs);
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
    const paymentHeader =
      req.headers['x-payment'] || req.headers['X-Payment'] ||
      req.headers['payment-signature'] || req.headers['Payment-Signature'];

    const result = await httpServer.processHTTPRequest({
      adapter,
      path,
      method: req.method || 'POST',
      paymentHeader: paymentHeader || undefined,
    });

    if (result.type === 'no-payment-required' || result.type === 'payment-verified') {
      return true;
    }

    if (result.type === 'payment-error') {
      const { response } = result;
      res.status(response.status || 402);
      Object.entries(response.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
      res.json(response.body || { error: 'Payment required', docs: 'https://aegisgov.ai/sec-mcp' });
      return false;
    }

    return false;
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') return true;
    console.error('[x402] error:', e.message);
    res.status(500).json({ error: 'Payment processing error', details: e.message });
    return false;
  }
}

module.exports = { requirePayment };
