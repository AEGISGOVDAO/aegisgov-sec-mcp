// MCP Streamable HTTP endpoint — Model Context Protocol v1.0
// Handles: initialize, tools/list, tools/call
// Enables compatibility with Claude Desktop, Cursor, Cline, and Glama

const { searchCompanies, getCompany } = require('../lib/edgar');

const SERVER_INFO = {
  name: 'aegisgov-sec',
  version: '1.0.0',
};

const CAPABILITIES = {
  tools: {},
};

const TOOLS = [
  {
    name: 'search_companies',
    description: 'Search SEC EDGAR for public companies by name or ticker symbol.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Company name or ticker symbol' },
        limit: { type: 'integer', description: 'Max results (1-20)', default: 10 },
      },
    },
  },
  {
    name: 'get_company_profile',
    description: 'Get company profile and recent SEC filings by ticker or CIK.',
    inputSchema: {
      type: 'object',
      required: ['identifier'],
      properties: {
        identifier: { type: 'string', description: 'Ticker symbol or CIK number' },
      },
    },
  },
  {
    name: 'get_filings',
    description: 'Get SEC filings for a company filtered by form type (10-K, 10-Q, 8-K, etc.).',
    inputSchema: {
      type: 'object',
      required: ['identifier'],
      properties: {
        identifier: { type: 'string', description: 'Ticker symbol or CIK number' },
        formType:   { type: 'string', description: 'Form type: 10-K, 10-Q, 8-K', default: '10-K' },
        limit:      { type: 'integer', description: 'Max results', default: 5 },
      },
    },
  },
  {
    name: 'get_financials',
    description: 'Get XBRL financial data (revenue, net income, assets) for a public company.',
    inputSchema: {
      type: 'object',
      required: ['identifier'],
      properties: {
        identifier: { type: 'string', description: 'Ticker symbol or CIK number' },
        metric:     { type: 'string', description: 'Financial metric: revenues, netIncome, assets', default: 'revenues' },
      },
    },
  },
];

async function handleToolCall(name, args) {
  // Proxy to existing Vercel handlers (reuse their logic)
  switch (name) {
    case 'search_companies': {
      const results = await searchCompanies(args.query, args.limit || 10);
      return { ok: true, query: args.query, count: results.length, results };
    }
    case 'get_company_profile': {
      const company = await getCompany(args.identifier);
      return { ok: true, company };
    }
    case 'get_filings':
    case 'get_financials': {
      // Delegate to handler modules
      const handler = require(`./${name === 'get_filings' ? 'filings' : 'financials'}`);
      const mockReq = { method: 'POST', body: args };
      let responseData;
      const mockRes = {
        status: () => mockRes,
        json: (d) => { responseData = d; },
        setHeader: () => {},
        end: () => {},
      };
      await handler(mockReq, mockRes);
      return responseData;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function jsonrpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('MCP-Version', '2025-03-26');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({ server: SERVER_INFO, capabilities: CAPABILITIES, tools: TOOLS.length });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { method, id, params } = body;

  try {
    switch (method) {
      case 'initialize':
        return res.json(jsonrpc(id, {
          protocolVersion: '2025-03-26',
          serverInfo: SERVER_INFO,
          capabilities: CAPABILITIES,
        }));

      case 'notifications/initialized':
        return res.status(202).end();

      case 'tools/list':
        return res.json(jsonrpc(id, { tools: TOOLS }));

      case 'tools/call': {
        const { name, arguments: args = {} } = params || {};
        if (!name) return res.json(jsonrpcError(id, -32602, 'Missing tool name'));
        const result = await handleToolCall(name, args);
        return res.json(jsonrpc(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }));
      }

      case 'ping':
        return res.json(jsonrpc(id, {}));

      default:
        return res.json(jsonrpcError(id, -32601, `Method not found: ${method}`));
    }
  } catch (err) {
    return res.json(jsonrpcError(id, -32603, err.message));
  }
};
