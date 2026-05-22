module.exports = (req, res) => {
  const demo = process.env.DEMO_MODE === 'true';
  res.json({
    service: 'AegisGov SEC Intelligence MCP',
    description: 'SEC/EDGAR financial filings API for AI agents. Search companies, get 10-K/10-Q/8-K filings, and pull financial data. No API key required — pay per query in USDC.',
    status: demo ? 'FREE BETA — no payment required' : 'LIVE — pay per query in USDC',
    tools: [
      { endpoint: 'POST /search', price: demo ? 'FREE' : '$0.01 USDC', description: 'Search companies by name or ticker' },
      { endpoint: 'POST /company', price: demo ? 'FREE' : '$0.01 USDC', description: 'Get company profile + recent filings' },
      { endpoint: 'POST /filings', price: demo ? 'FREE' : '$0.02 USDC', description: 'Get filings by form type (10-K, 10-Q, 8-K)' },
      { endpoint: 'POST /financials', price: demo ? 'FREE' : '$0.05 USDC', description: 'Get XBRL financial data (revenue, income, assets)' },
    ],
    payment_protocol: 'x402',
    networks: {
      evm: process.env.X402_NETWORK || 'eip155:8453',
      solana: process.env.X402_SOL_NETWORK || 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    },
    facilitator: 'https://facilitator.payai.network',
    data_source: 'SEC EDGAR (data.sec.gov) — official US government data, no third-party',
    docs: 'https://aegisgov.ai/sec-mcp',
  });
};
