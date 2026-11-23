import express from 'express';
import { initDb, recentLog } from './db.js';
import * as svc from './service.js';
import { PAIRS, SYMBOLS } from './stellar.js';

await initDb();
const app = express();
app.use(express.json());

const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  res.status(e.status || 500).json({ error: e.message, codes: e.codes || null });
});

app.get('/api/meta', h(async (_q, res) => res.json({ symbols: SYMBOLS, pairs: PAIRS })));
app.get('/api/accounts', h(async (_q, res) => res.json(await svc.accountInfo())));
app.get('/api/rates', h(async (_q, res) => res.json(await svc.rates())));
app.get('/api/orderbook', h(async (q, res) => res.json(await svc.orderbook(q.query.base, q.query.quote))));
app.get('/api/trades', h(async (q, res) => res.json(await svc.trades(q.query.base, q.query.quote))));
app.get('/api/offers/:role', h(async (q, res) => res.json(await svc.offersOf(q.params.role))));
app.post('/api/offers', h(async (q, res) => res.json(await svc.placeOffer(q.body))));
app.post('/api/offers/cancel', h(async (q, res) => res.json(await svc.cancelOffer(q.body))));
app.get('/api/quote', h(async (q, res) => res.json(await svc.quote(q.query))));
app.post('/api/swap', h(async (q, res) => res.json(await svc.swap(q.body))));
app.get('/api/dashboard', h(async (_q, res) => res.json(await svc.dashboard())));
app.get('/api/log', h(async (_q, res) => res.json(await recentLog())));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API chạy tại http://localhost:${port}`));
