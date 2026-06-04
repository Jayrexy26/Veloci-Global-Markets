const MARKET_DEFS = {
  crypto: {
    url:  'https://scanner.tradingview.com/crypto/scan',
    body: {
      columns: ['name','description','close','change','change_abs','volume','market_cap_calc','high','low'],
      sort:    { sortBy: 'market_cap_calc', sortOrder: 'desc' },
      range:   [0, 100],
    },
  },
  forex: {
    url:  'https://scanner.tradingview.com/forex/scan',
    body: {
      columns: ['name','description','close','change','change_abs','bid','ask','volume','high','low'],
      sort:    { sortBy: 'volume', sortOrder: 'desc' },
      range:   [0, 80],
    },
  },
  stocks: {
    url:  'https://scanner.tradingview.com/america/scan',
    body: {
      filter:  [
        { left: 'market_cap_basic', operation: 'greater', right: 1000000000 },
        { left: 'is_primary',       operation: 'equal',   right: true },
      ],
      columns: ['name','description','close','change','change_abs','volume','market_cap_basic','high','low'],
      sort:    { sortBy: 'market_cap_basic', sortOrder: 'desc' },
      range:   [0, 80],
    },
  },
  indices: {
    url:  'https://scanner.tradingview.com/global/scan',
    body: {
      symbols: { tickers: [
        'FOREXCOM:SPXUSD','FOREXCOM:NSXUSD','CURRENCYCOM:US30',
        'INDEX:NKY','INDEX:DAX','INDEX:FTSE','FOREXCOM:EU50USD',
        'INDEX:HSI','INDEX:CAC40','CURRENCYCOM:AU200',
        'INDEX:SENSEX','CURRENCYCOM:CN50','INDEX:TAIEX',
        'INDEX:KOSPI','INDEX:STI','INDEX:BVSP','INDEX:MXX',
        'INDEX:IBEX35','INDEX:FTSEMIB','INDEX:SMI',
      ]},
      columns: ['name','description','close','change','change_abs','volume','high','low'],
    },
  },
  commodities: {
    url:  'https://scanner.tradingview.com/global/scan',
    body: {
      symbols: { tickers: [
        'COMEX:GC1!','NYMEX:CL1!','COMEX:SI1!','NYMEX:NG1!',
        'CBOT:C1!','CBOT:W1!','CBOT:S1!','COMEX:HG1!',
        'NYMEX:RB1!','NYMEX:HO1!','NYMEX:PL1!','COMEX:PA1!',
        'NYMEX:BZ1!','CBOT:BO1!','ICE:CC1!','ICE:KC1!',
        'ICE:CT1!','ICE:SB1!',
      ]},
      columns: ['name','description','close','change','change_abs','volume','high','low'],
    },
  },
  etf: {
    url:  'https://scanner.tradingview.com/america/scan',
    body: {
      filter:  [
        { left: 'typespecs', operation: 'has',     right: ['etf'] },
        { left: 'volume',    operation: 'greater', right: 500000  },
      ],
      columns: ['name','description','close','change','change_abs','volume','market_cap_basic','high','low'],
      sort:    { sortBy: 'volume', sortOrder: 'desc' },
      range:   [0, 80],
    },
  },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const market = (req.query.market || 'crypto').toLowerCase();
  const def = MARKET_DEFS[market];

  if (!def) {
    return res.status(400).json({ error: `Unknown market: ${market}` });
  }

  try {
    const tvRes = await fetch(def.url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin':       'https://www.tradingview.com',
        'Referer':      'https://www.tradingview.com/',
        'User-Agent':   'Mozilla/5.0 (compatible)',
      },
      body: JSON.stringify(def.body),
    });

    if (!tvRes.ok) {
      throw new Error(`TradingView returned HTTP ${tvRes.status}`);
    }

    const data = await tvRes.json();

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
