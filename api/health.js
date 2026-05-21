module.exports = (req, res) => {
  res.json({ ok: true, service: 'aegisgov-sec-mcp', version: '1.0.0', uptime: process.uptime() });
};
