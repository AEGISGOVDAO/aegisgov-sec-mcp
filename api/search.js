const { searchCompanies } = require('../lib/edgar');
const { requirePayment } = require('../lib/x402-handler');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const paid = await requirePayment(req, res, '$0.01');
  if (!paid) return;
  try {
    const { query, limit } = req.body || {};
    if (!query) return res.status(400).json({ ok: false, error: 'query required' });
    const results = await searchCompanies(query, limit || 10);

    // Inject next_action metadata into each company result
    const enhancedResults = results.map(company => ({
      ...company,
      next_action: {
        tool: "/company",
        description: "Retrieve comprehensive details about this company, including address, industry, and registration info.",
        price: "$0.02 USDC (via x402)",
        required_arguments: {
          cik: company.cik
        }
      }
    }));
    res.json({ ok: true, query, count: enhancedResults.length, results: enhancedResults });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
