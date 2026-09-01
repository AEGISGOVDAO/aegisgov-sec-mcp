module.exports = (req, res) => {
  res.json({
    ok: true,
    service: 'aegisgov-sec-mcp',
    version: '1.0.0',
    uptime: process.uptime(),
    git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    vercel_deployment_id: process.env.VERCEL_DEPLOYMENT_ID || 'unknown',
  });
};
