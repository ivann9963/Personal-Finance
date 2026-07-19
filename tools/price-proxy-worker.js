/**
 * Finance PWA — free price proxy (Cloudflare Worker)
 * ---------------------------------------------------
 * Why: a static browser app can't call Yahoo Finance directly (no CORS headers).
 * This tiny worker fetches Yahoo server-side and adds CORS, so the app gets live
 * stock/ETF/index quotes + FX with NO API key and full international coverage.
 *
 * Deploy (free, ~5 minutes, nothing to maintain):
 *   1. Sign in at https://dash.cloudflare.com  →  Workers & Pages  →  Create  →  Worker.
 *   2. Replace the starter code with THIS file's contents, click Deploy.
 *   3. Copy the worker URL (e.g. https://price-proxy.yourname.workers.dev).
 *   4. In the app: Wealth → add a holding → "Turn on stocks & ETFs" → paste that URL.
 *
 * Endpoints (all return JSON with Access-Control-Allow-Origin: *):
 *   GET /search?q=apple            → { results:[{symbol,name,type,exchange}] }
 *   GET /quote?symbol=AAPL         → { symbol, price, currency }
 *   GET /fx?from=USD&to=EUR        → { rate }        (units of `to` per 1 `from`)
 *
 * Privacy: only the ticker/currency you look up is sent (to Yahoo, via your own
 * worker). Nothing else leaves your device.
 */
const YAHOO = 'https://query1.finance.yahoo.com';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; FinancePWA/1.0)' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'content-type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=60',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CORS });

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '');
    try {
      if (p.endsWith('/search')) {
        const q = (url.searchParams.get('q') || '').trim();
        if (q.length < 2) return json({ results: [] });
        const r = await fetch(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`, { headers: UA });
        const d = await r.json();
        const keep = ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'CURRENCY'];
        const results = (d.quotes || [])
          .filter(x => x.symbol && keep.includes(x.quoteType))
          .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, type: x.quoteType, exchange: x.exchDisp || '' }));
        return json({ results });
      }
      if (p.endsWith('/quote')) {
        const sym = url.searchParams.get('symbol');
        if (!sym) return json({ error: 'symbol required' }, 400);
        const r = await fetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`, { headers: UA });
        const d = await r.json();
        const m = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
        if (!m || m.regularMarketPrice == null) return json({ error: 'no quote for ' + sym }, 404);
        return json({ symbol: sym, price: m.regularMarketPrice, currency: m.currency || 'USD' });
      }
      if (p.endsWith('/fx')) {
        const from = (url.searchParams.get('from') || '').toUpperCase();
        const to = (url.searchParams.get('to') || '').toUpperCase();
        if (!from || !to) return json({ error: 'from and to required' }, 400);
        if (from === to) return json({ rate: 1 });
        const r = await fetch(`${YAHOO}/v8/finance/chart/${from}${to}=X?range=1d&interval=1d`, { headers: UA });
        const d = await r.json();
        const rate = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta && d.chart.result[0].meta.regularMarketPrice;
        if (rate == null) return json({ error: 'no fx ' + from + to }, 404);
        return json({ rate });
      }
      return json({ ok: true, service: 'finance price proxy', endpoints: ['/search?q=', '/quote?symbol=', '/fx?from=&to='] });
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  },
};
