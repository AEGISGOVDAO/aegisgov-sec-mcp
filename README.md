# AegisGov SEC Intelligence MCP

SEC/EDGAR financial data for AI agents. **Currently free — no payment required.**

**Live endpoint:** `https://aegisgov-sec-mcp.vercel.app`

> 🆓 **Free Beta Mode active.** All tools return real SEC data at no cost. x402 USDC payments (Base mainnet + Solana mainnet) activate when ready.

## Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `search` | `POST /search` | Search public companies by name or ticker symbol |
| `company` | `POST /company` | Company profile + recent filings |
| `filings` | `POST /filings` | Get 10-K, 10-Q, 8-K filings with links |
| `financials` | `POST /financials` | XBRL financial data — revenue, income, assets |

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

# Get 10-K filings
curl -X POST https://aegisgov-sec-mcp.vercel.app/filings \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "formType": "10-K", "limit": 3}'

# Get financial data
curl -X POST https://aegisgov-sec-mcp.vercel.app/financials \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL"}'
```

## MCP Discovery

```
GET https://aegisgov-sec-mcp.vercel.app/.well-known/mcp.json
```

## Payment (x402)

Uses [x402 protocol](https://x402.org) — HTTP 402 with USDC micropayments. No accounts. No API keys. Agents pay autonomously.

**Supported networks:**
- Base mainnet (`eip155:8453`) — USDC
- Solana mainnet (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) — USDC

**Facilitator:** [PayAI](https://payai.network) — free tier, no key required

## Why use this?

- **No API key required** — directly hits official SEC EDGAR (data.sec.gov)
- **Official government data** — 100% accurate, updated continuously
- **10K+ public companies** — all SEC-registered issuers
- **Agent-native** — designed for MCP, works with Claude, GPT, any LLM toolchain
- **Dual-network x402** — pay in USDC on Base or Solana

## Data Source

[SEC EDGAR](https://data.sec.gov) — official US Securities and Exchange Commission data

## Links

- **Live:** https://aegisgov-sec-mcp.vercel.app
- **Docs:** https://aegisgov.ai/sec-mcp
- **GitHub:** https://github.com/AEGISGOVDAO/aegisgov-sec-mcp
