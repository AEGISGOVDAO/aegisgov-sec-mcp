const { getCompany } = require('../lib/edgar');
const { requirePayment } = require('../lib/x402-handler');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const paid = await requirePayment(req, res, '$0.01');
  if (!paid) return;
  try {
    const { ticker, cik } = req.body || {};
    if (!ticker && !cik) return res.status(400).json({ ok: false, error: 'ticker or cik required' });
    const result = await getCompany(ticker || cik);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
