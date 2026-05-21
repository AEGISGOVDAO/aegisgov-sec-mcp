// SEC EDGAR API wrapper — uses official free data.sec.gov endpoints
// No API key required. Rate limit: 10 req/sec per SEC guidelines.
// User-Agent required by SEC fair-access policy.

const USER_AGENT = 'AegisGov AI contact@aegisgov.ai';

async function edgarFetch(url) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`EDGAR ${res.status}: ${url}`);
  return res.json();
}

// Resolve ticker to CIK
async function tickerToCik(ticker) {
  const data = await edgarFetch('https://www.sec.gov/files/company_tickers.json');
  const upper = ticker.toUpperCase();
  for (const entry of Object.values(data)) {
    if (entry.ticker === upper) {
      return String(entry.cik_str).padStart(10, '0');
    }
  }
  throw new Error(`Ticker not found: ${ticker}`);
}

// Search companies by name
async function searchCompanies(query, limit = 10) {
  const fetch = (await import('node-fetch')).default;
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${query}"`)}&dateRange=custom&startdt=2020-01-01&forms=10-K,10-Q,8-K&hits.hits._source=period_of_report,entity_name,file_num,period_of_report,form_type,file_date,biz_location,inc_states`;
  const res = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&category=form-type&forms=10-K`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  
  // Use the company tickers endpoint for name search
  const tickers = await edgarFetch('https://www.sec.gov/files/company_tickers.json');
  const lower = query.toLowerCase();
  const matches = Object.values(tickers)
    .filter(e => e.title && e.title.toLowerCase().includes(lower))
    .slice(0, limit)
    .map(e => ({
      name: e.title,
      ticker: e.ticker,
      cik: String(e.cik_str).padStart(10, '0'),
    }));
  return matches;
}

// Get company info + recent filings
async function getCompany(cikOrTicker) {
  let cik = cikOrTicker;
  if (!/^\d+$/.test(cikOrTicker)) {
    cik = await tickerToCik(cikOrTicker);
  } else {
    cik = String(parseInt(cik)).padStart(10, '0');
  }

  const data = await edgarFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const recent = data.filings?.recent || {};

  const filings = [];
  const limit = Math.min(10, (recent.form || []).length);
  for (let i = 0; i < limit; i++) {
    filings.push({
      form: recent.form?.[i],
      date: recent.filingDate?.[i],
      accessionNumber: recent.accessionNumber?.[i]?.replace(/-/g, ''),
      primaryDocument: recent.primaryDocument?.[i],
      reportDate: recent.reportDate?.[i],
    });
  }

  return {
    name: data.name,
    cik: data.cik,
    ticker: data.tickers?.[0] || null,
    sic: data.sic,
    sicDescription: data.sicDescription,
    stateOfIncorporation: data.stateOfIncorporation,
    fiscalYearEnd: data.fiscalYearEnd,
    recentFilings: filings,
  };
}

// Get recent filings filtered by form type
async function getFilings(cikOrTicker, formType = '10-K', limit = 5) {
  let cik = cikOrTicker;
  if (!/^\d+$/.test(cikOrTicker)) {
    cik = await tickerToCik(cikOrTicker);
  } else {
    cik = String(parseInt(cik)).padStart(10, '0');
  }

  const data = await edgarFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const recent = data.filings?.recent || {};
  const forms = recent.form || [];

  const results = [];
  for (let i = 0; i < forms.length && results.length < limit; i++) {
    if (!formType || forms[i] === formType || forms[i]?.startsWith(formType)) {
      const accession = recent.accessionNumber?.[i]?.replace(/-/g, '');
      results.push({
        form: forms[i],
        date: recent.filingDate?.[i],
        reportDate: recent.reportDate?.[i],
        accessionNumber: recent.accessionNumber?.[i],
        primaryDocument: recent.primaryDocument?.[i],
        url: accession
          ? `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accession}/${recent.primaryDocument?.[i]}`
          : null,
        indexUrl: accession
          ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${formType}&dateb=&owner=include&count=40`
          : null,
      });
    }
  }

  return {
    company: data.name,
    cik: data.cik,
    ticker: data.tickers?.[0] || null,
    formType,
    filings: results,
  };
}

// Get XBRL financial facts (revenue, income, assets, etc.)
async function getFinancials(cikOrTicker, concept = 'Revenues') {
  let cik = cikOrTicker;
  if (!/^\d+$/.test(cikOrTicker)) {
    cik = await tickerToCik(cikOrTicker);
  } else {
    cik = String(parseInt(cik)).padStart(10, '0');
  }

  // Get company name first
  const sub = await edgarFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  
  // Common financial concepts
  const CONCEPTS = {
    revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
    netincome: ['NetIncomeLoss'],
    assets: ['Assets'],
    liabilities: ['Liabilities'],
    eps: ['EarningsPerShareBasic'],
    shares: ['CommonStockSharesOutstanding'],
  };

  const key = concept.toLowerCase();
  const conceptNames = CONCEPTS[key] || [concept];

  for (const name of conceptNames) {
    try {
      const data = await edgarFetch(
        `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${name}.json`
      );
      const units = data.units?.USD || data.units?.shares || [];
      const annual = units.filter(u => u.form === '10-K').slice(-5);
      return {
        company: sub.name,
        cik: data.cik,
        ticker: sub.tickers?.[0] || null,
        concept: name,
        label: data.label,
        unit: Object.keys(data.units || {})[0] || 'USD',
        annualData: annual.map(u => ({
          year: u.end?.substring(0, 4),
          period: u.end,
          value: u.val,
          form: u.form,
          filed: u.filed,
        })),
      };
    } catch (e) {
      continue;
    }
  }

  throw new Error(`No financial data found for concept: ${concept}`);
}

module.exports = { searchCompanies, getCompany, getFilings, getFinancials, tickerToCik };
