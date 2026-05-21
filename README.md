# AegisGov SEC Intelligence MCP

SEC/EDGAR financial filings API for AI agents. Search 40M+ SEC filings, get company profiles, annual/quarterly reports, and structured XBRL financial data.

**Data source:** Official SEC EDGAR (`data.sec.gov`) — no third-party dependency, no API key required.

**Payment:** Pay per query in USDC via [x402 protocol](https://x402.org). Currently FREE during beta.

## Tools

| Tool | Endpoint | Price | Description |
|------|----------|-------|-------------|
| `search_companies` | `POST /search` | FREE (beta) | Search companies by name |
| `get_company` | `POST /company` | FREE (beta) | Company profile + recent filings |
| `get_filings` | `POST /filings` | FREE (beta) | 10-K, 10-Q, 8-K filings with URLs |
| `get_financials` | `POST /financials` | FREE (beta) | XBRL financial data (revenue, income, assets) |

## Quick Start

```bash
# Search for a company
curl -X POST https://aegisgov-sec-mcp.vercel.app/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Apple"}'

# Get company profile by ticker
curl -X POST https://aegisgov-sec-mcp.vercel.app/company \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL"}'

# Get recent 10-K filings
curl -X POST https://aegisgov-sec-mcp.vercel.app/filings \
  -H "Content-Type: application/json" \
  -d '{"ticker": "MSFT", "formType": "10-K", "limit": 3}'

# Get revenue history
curl -X POST https://aegisgov-sec-mcp.vercel.app/financials \
  -H "Content-Type: application/json" \
  -d '{"ticker": "NVDA", "concept": "revenue"}'
```

## MCP Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "aegisgov-sec": {
      "url": "https://aegisgov-sec-mcp.vercel.app/.well-known/mcp.json"
    }
  }
}
```

## Discovery

- Smithery: https://smithery.ai/server/@aegisgovdao/aegisgov-sec
- Glama: https://glama.ai/mcp/servers/@aegisgovdao/aegisgov-sec
- Manifest: https://aegisgov-sec-mcp.vercel.app/.well-known/mcp.json

## About

Built by [AegisGov AI](https://aegisgov.ai) — agent-to-agent data infrastructure, USDC micropayments via x402.

Topics: `mcp` `model-context-protocol` `mcp-server` `sec` `edgar` `finance` `financial-data` `x402` `ai-agents`
