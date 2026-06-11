#!/usr/bin/env node
// mcp-stdio.js — stdio MCP entrypoint for Glama / mcp-proxy / Claude Desktop
// Communicates over stdin/stdout using newline-delimited JSON-RPC 2.0
// ALL logs go to stderr — stdout is JSON-only

'use strict';

const { searchCompanies, getCompany } = require('./lib/edgar');

// Silence any accidental console.log going to stdout
const origLog = console.log;
console.log = (...args) => process.stderr.write('[log] ' + args.join(' ') + '\n');

process.stderr.write('[aegisgov-sec-mcp] stdio server starting\n');

// ── Tool definitions ──────────────────────────────────────────────────────────

const SERVER_INFO = { name: 'aegisgov-sec', version: '1.0.0' };
const CAPABILITIES = { tools: {} };

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

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'search_companies': {
      const results = await searchCompanies(args.query, args.limit || 10);
      return { ok: true, query: args.query, count: results.length, results };
    }
    case 'get_company_profile': {
      const company = await getCompany(args.identifier);
      return { ok: true, company };
    }
    case 'get_filings': {
      const handler = require('./api/filings');
      return await mockHandler(handler, args);
    }
    case 'get_financials': {
      const handler = require('./api/financials');
      return await mockHandler(handler, args);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function mockHandler(handler, args) {
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

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

function jsonrpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ── Message handler ───────────────────────────────────────────────────────────

async function handleMessage(msg) {
  const { method, id, params } = msg;

  try {
    switch (method) {
      case 'initialize':
        send(jsonrpc(id, {
          protocolVersion: '2025-03-26',
          serverInfo: SERVER_INFO,
          capabilities: CAPABILITIES,
        }));
        break;

      case 'notifications/initialized':
        // No response needed for notifications
        break;

      case 'tools/list':
        send(jsonrpc(id, { tools: TOOLS }));
        break;

      case 'tools/call': {
        const { name, arguments: args = {} } = params || {};
        if (!name) {
          send(jsonrpcError(id, -32602, 'Missing tool name'));
          break;
        }
        const result = await handleToolCall(name, args);
        send(jsonrpc(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }));
        break;
      }

      case 'ping':
        send(jsonrpc(id, {}));
        break;

      default:
        send(jsonrpcError(id, -32601, `Method not found: ${method}`));
    }
  } catch (err) {
    process.stderr.write(`[aegisgov-sec-mcp] error: ${err.message}\n`);
    if (id !== undefined && id !== null) {
      send(jsonrpcError(id, -32603, err.message));
    }
  }
}

// ── stdin reader (newline-delimited JSON) ─────────────────────────────────────

let buffer = '';
let pendingCount = 0;
let stdinEnded = false;

function checkDone() {
  if (stdinEnded && pendingCount === 0) {
    process.stderr.write('[aegisgov-sec-mcp] all requests done, exiting\n');
    process.exit(0);
  }
}

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep incomplete last line

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (e) {
      process.stderr.write(`[aegisgov-sec-mcp] invalid JSON: ${trimmed}\n`);
      send(jsonrpcError(null, -32700, 'Parse error'));
      continue;
    }
    pendingCount++;
    handleMessage(msg)
      .catch((err) => process.stderr.write(`[aegisgov-sec-mcp] unhandled: ${err.message}\n`))
      .finally(() => { pendingCount--; checkDone(); });
  }
});

process.stdin.on('end', () => {
  // Flush any remaining buffered line (no trailing newline)
  const trimmed = buffer.trim();
  if (trimmed) {
    let msg;
    try {
      msg = JSON.parse(trimmed);
      pendingCount++;
      handleMessage(msg)
        .catch((err) => process.stderr.write(`[aegisgov-sec-mcp] unhandled: ${err.message}\n`))
        .finally(() => { pendingCount--; checkDone(); });
    } catch (e) {
      send(jsonrpcError(null, -32700, 'Parse error'));
    }
  }
  stdinEnded = true;
  process.stderr.write('[aegisgov-sec-mcp] stdin closed\n');
  checkDone();
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[aegisgov-sec-mcp] uncaught: ${err.message}\n`);
});
