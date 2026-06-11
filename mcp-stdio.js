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
    description: [
      'Search the SEC EDGAR database for US public companies by name or ticker symbol.',
      'Use this tool when you need to look up a company to get its CIK number, confirm its official SEC-registered name, or find its ticker — for example: "find Apple on EDGAR" or "what is the CIK for Tesla?".',
      'Returns up to 20 matches (default 10), each with the company name, ticker symbol, and 10-digit CIK number.',
      'This tool is read-only and queries the official SEC EDGAR company tickers dataset, which covers all SEC-registered public companies.',
      'Use the returned ticker or CIK as the identifier in get_company_profile, get_filings, or get_financials.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Company name or ticker symbol to search. Partial name matching is supported. Examples: "Apple", "AAPL", "Goldman Sachs", "GS".',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return. Integer between 1 and 20. Defaults to 10.',
          default: 10,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok:      { type: 'boolean', description: 'True if the request succeeded.' },
        query:   { type: 'string',  description: 'The search query that was executed.' },
        count:   { type: 'integer', description: 'Number of results returned.' },
        results: {
          type: 'array',
          description: 'List of matching companies.',
          items: {
            type: 'object',
            properties: {
              name:   { type: 'string',  description: 'Official SEC-registered company name.' },
              ticker: { type: 'string',  description: 'Stock ticker symbol.' },
              cik:    { type: 'string',  description: '10-digit SEC CIK number (zero-padded).' },
            },
          },
        },
      },
    },
  },
  {
    name: 'get_company_profile',
    description: [
      'Retrieve the SEC EDGAR profile and recent filing history for a public company.',
      'Use this tool when you need company metadata and a summary of recent filings — for example: "give me a profile of Microsoft" or "what has Apple filed recently with the SEC?".',
      'Returns: official company name, CIK, ticker, SIC industry code and description, state of incorporation, fiscal year end, and the 10 most recent filings (form type, date, accession number).',
      'This tool is read-only and pulls live data from the SEC EDGAR submissions API.',
      'Use get_filings to filter by a specific form type, or get_financials to retrieve structured financial data.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['identifier'],
      properties: {
        identifier: {
          type: 'string',
          description: 'Ticker symbol or CIK number for the company. Examples: "AAPL", "TSLA", "0000320193". Use search_companies first if you only have a company name.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok:      { type: 'boolean' },
        company: {
          type: 'object',
          properties: {
            name:                 { type: 'string',  description: 'Official SEC-registered company name.' },
            cik:                  { type: 'string',  description: '10-digit CIK number.' },
            ticker:               { type: 'string',  description: 'Primary ticker symbol.' },
            sic:                  { type: 'string',  description: 'SIC industry code.' },
            sicDescription:       { type: 'string',  description: 'SIC industry description.' },
            stateOfIncorporation: { type: 'string',  description: '2-letter state abbreviation.' },
            fiscalYearEnd:        { type: 'string',  description: 'Fiscal year end (MMDD format).' },
            recentFilings: {
              type: 'array',
              description: 'Up to 10 most recent SEC filings.',
              items: {
                type: 'object',
                properties: {
                  form:            { type: 'string', description: 'Form type (e.g. 10-K, 8-K).' },
                  date:            { type: 'string', description: 'Filing date (YYYY-MM-DD).' },
                  accessionNumber: { type: 'string', description: 'SEC accession number.' },
                  primaryDocument: { type: 'string', description: 'Primary document filename.' },
                  reportDate:      { type: 'string', description: 'Period of report (YYYY-MM-DD).' },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'get_filings',
    description: [
      'Retrieve a list of SEC filings for a public company filtered by form type.',
      'Use this tool when you need to find specific regulatory filings — for example: "get the last three 10-K annual reports for Microsoft" or "show me recent 8-K disclosures for Tesla".',
      'Returns up to the requested number of matching filings, each with: form type, filing date, report period, accession number, primary document filename, and direct SEC.gov URL.',
      'Common form types: 10-K (annual report), 10-Q (quarterly report), 8-K (material events/disclosures), DEF 14A (proxy statement), S-1 (IPO registration).',
      'This tool is read-only and queries the SEC EDGAR submissions API.',
      'Use get_financials to extract structured numeric data from 10-K and 10-Q filings.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['identifier'],
      properties: {
        identifier: {
          type: 'string',
          description: 'Ticker symbol or CIK number for the company. Examples: "MSFT", "0000789019". Use search_companies to resolve a company name to a ticker or CIK.',
        },
        formType: {
          type: 'string',
          description: 'SEC form type to filter by. Common values: "10-K" (annual), "10-Q" (quarterly), "8-K" (events), "DEF 14A" (proxy), "S-1" (registration). Defaults to "10-K".',
          default: '10-K',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of filings to return. Defaults to 5.',
          default: 5,
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok:       { type: 'boolean' },
        company:  { type: 'string',  description: 'Official company name.' },
        cik:      { type: 'string',  description: '10-digit CIK number.' },
        ticker:   { type: 'string',  description: 'Primary ticker symbol.' },
        formType: { type: 'string',  description: 'Form type that was filtered on.' },
        filings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              form:            { type: 'string', description: 'Form type.' },
              date:            { type: 'string', description: 'Filing date (YYYY-MM-DD).' },
              reportDate:      { type: 'string', description: 'Period of report (YYYY-MM-DD).' },
              accessionNumber: { type: 'string', description: 'SEC accession number (dashed format).' },
              primaryDocument: { type: 'string', description: 'Primary document filename.' },
              url:             { type: 'string', description: 'Direct URL to the primary filing document on SEC.gov.' },
              indexUrl:        { type: 'string', description: 'URL to the EDGAR filing index page.' },
            },
          },
        },
      },
    },
  },
  {
    name: 'get_financials',
    description: [
      'Retrieve structured XBRL financial data for a public company from SEC EDGAR.',
      'Use this tool when you need historical financial figures — for example: "what was Apple\'s revenue for the last 5 years?" or "show me Amazon\'s net income trend".',
      'Returns the last 5 years of annual (10-K) data for the requested metric, including the value, reporting period, and filing date.',
      'Available metrics: "revenue" (total revenues), "netincome" (net income/loss), "assets" (total assets), "liabilities" (total liabilities), "eps" (earnings per share, basic), "shares" (common shares outstanding).',
      'Data comes from the official SEC XBRL EDGAR API (data.sec.gov) and reflects exactly what companies reported. This tool is read-only.',
      'Use get_filings to access the full filing documents if you need data beyond these standard metrics.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['identifier'],
      properties: {
        identifier: {
          type: 'string',
          description: 'Ticker symbol or CIK number for the company. Examples: "AAPL", "AMZN", "0000018230". Use search_companies to resolve a name.',
        },
        metric: {
          type: 'string',
          description: 'Financial metric to retrieve. One of: "revenue", "netincome", "assets", "liabilities", "eps", "shares". Defaults to "revenue".',
          default: 'revenue',
          enum: ['revenue', 'netincome', 'assets', 'liabilities', 'eps', 'shares'],
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok:          { type: 'boolean' },
        company:     { type: 'string',  description: 'Official company name.' },
        cik:         { type: 'string',  description: '10-digit CIK number.' },
        ticker:      { type: 'string',  description: 'Primary ticker symbol.' },
        concept:     { type: 'string',  description: 'XBRL concept name used for the query.' },
        label:       { type: 'string',  description: 'Human-readable label for the metric.' },
        unit:        { type: 'string',  description: 'Unit of measurement (e.g. USD, shares).' },
        annualData: {
          type: 'array',
          description: 'Up to 5 years of annual 10-K data, oldest first.',
          items: {
            type: 'object',
            properties: {
              year:   { type: 'string',  description: 'Fiscal year (YYYY).' },
              period: { type: 'string',  description: 'End of reporting period (YYYY-MM-DD).' },
              value:  { type: 'number',  description: 'Reported value in the specified unit.' },
              form:   { type: 'string',  description: 'Filing form type (10-K).' },
              filed:  { type: 'string',  description: 'Date the filing was submitted (YYYY-MM-DD).' },
            },
          },
        },
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
  // Don't exit — keep serving
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[aegisgov-sec-mcp] unhandled rejection: ${reason}\n`);
  // Don't exit — keep serving
});

process.stdout.on('error', (err) => {
  // mcp-proxy closed the pipe — graceful exit
  if (err.code === 'EPIPE') process.exit(0);
  process.stderr.write(`[aegisgov-sec-mcp] stdout error: ${err.message}\n`);
});
