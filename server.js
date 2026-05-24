// Standalone Express server for Docker / local dev
// Wraps the individual Vercel-style handler functions
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Load handlers
const indexHandler    = require('./api/index');
const healthHandler   = require('./api/health');
const manifestHandler = require('./api/manifest');
const searchHandler   = require('./api/search');
const companyHandler  = require('./api/company');
const filingsHandler  = require('./api/filings');
const financialsHandler = require('./api/financials');

app.get('/',                    (req, res) => indexHandler(req, res));
app.get('/health',              (req, res) => healthHandler(req, res));
app.get('/.well-known/mcp.json',(req, res) => manifestHandler(req, res));
app.post('/search',             (req, res) => searchHandler(req, res));
app.post('/company',            (req, res) => companyHandler(req, res));
app.post('/filings',            (req, res) => filingsHandler(req, res));
app.post('/financials',         (req, res) => financialsHandler(req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AegisGov SEC MCP running on port ${PORT}`));
