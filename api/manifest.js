module.exports = (req, res) => {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://aegisgov-sec-mcp.vercel.app';
  const demo = process.env.DEMO_MODE === 'true';
  res.json({
    schema_version: '1.0',
    name: 'aegisgov-sec',
    display_name: 'AegisGov SEC Intelligence',
    description: 'SEC/EDGAR financial filings API for AI agents. Search 40M+ filings, get 10-K annual reports, 10-Q quarterly reports, 8-K material events, and structured XBRL financial data. Covers all SEC-registered public companies. Official data from data.sec.gov — no scraping, no API key required from you.',
    version: '1.0.0',
    author: 'AegisGov AI',
    homepage: 'https://aegisgov.ai',
    tools: [
      {
        name: 'search_companies',
        description: 'Search public companies by name. Returns company name, ticker, and CIK.',
        endpoint: `${base}/search`,
        method: 'POST',
        payment: demo ? { price: 'FREE', status: 'beta' } : { price: '$0.01 USDC', network: 'Base', protocol: 'x402' },
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Company name to search (e.g. "Apple", "Lockheed")' },
            limit: { type: 'number', description: 'Max results 1-20, default 10' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_company',
        description: 'Get company profile and recent SEC filings by ticker or CIK.',
        endpoint: `${base}/company`,
        method: 'POST',
        payment: demo ? { price: 'FREE', status: 'beta' } : { price: '$0.01 USDC', network: 'Base', protocol: 'x402' },
        input_schema: {
          type: 'object',
          properties: {
            ticker: { type: 'string', description: 'Stock ticker (e.g. "AAPL", "MSFT")' },
            cik: { type: 'string', description: 'SEC CIK number (alternative to ticker)' },
          },
        },
      },
      {
        name: 'get_filings',
        description: 'Get SEC filings for a company filtered by form type. Returns filing URLs.',
        endpoint: `${base}/filings`,
        method: 'POST',
        payment: demo ? { price: 'FREE', status: 'beta' } : { price: '$0.02 USDC', network: 'Base', protocol: 'x402' },
        input_schema: {
          type: 'object',
          properties: {
            ticker: { type: 'string', description: 'Stock ticker (e.g. "NVDA")' },
            cik: { type: 'string', description: 'SEC CIK number' },
            formType: { type: 'string', description: 'Form type: 10-K, 10-Q, 8-K, DEF 14A, S-1, etc. Default: 10-K' },
            limit: { type: 'number', description: 'Max filings 1-20, default 5' },
          },
        },
      },
      {
        name: 'get_financials',
        description: 'Get structured XBRL financial data for any public company. Supports revenue, netincome, assets, liabilities, eps, shares.',
        endpoint: `${base}/financials`,
        method: 'POST',
        payment: demo ? { price: 'FREE', status: 'beta' } : { price: '$0.05 USDC', network: 'Base', protocol: 'x402' },
        input_schema: {
          type: 'object',
          required: ['ticker'],
          properties: {
            ticker: { type: 'string', description: 'Stock ticker (e.g. "TSLA")' },
            concept: { type: 'string', description: 'Financial concept: revenue, netincome, assets, liabilities, eps, shares. Default: revenue' },
          },
        },
      },
    ],
  });
};
