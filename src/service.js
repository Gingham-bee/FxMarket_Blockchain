import { Operation } from '@stellar/stellar-sdk';
import {
  server, assetOf, toAsset, loadAccounts, pubOf, submit, AppError, explain, sleep,
  PAIRS, SYMBOLS, ROLES, REF, CODES,
} from './stellar.js';

const num = (x) => Number(x);
const codeToSym = (code) => Object.keys(CODES).find((k) => CODES[k] === code) || code;

// ---------- YC03: tài khoản và số dư ----------
export async function accountInfo() {
  const accs = loadAccounts();
  const out = [];
  for (const role of ROLES) {
    const a = await server.loadAccount(accs[role].public);
    const bal = {};
    for (const b of a.balances) bal[b.asset_type === 'native' ? 'XLM' : codeToSym(b.asset_code)] = b.balance;
    out.push({ role, public: accs[role].public, balances: bal });
  }
  return out;
}

// ---------- YC05: order book, bid/ask/spread ----------
export async function orderbook(base, quote) {
  const ob = await server.orderbook(assetOf(base), assetOf(quote)).limit(20).call();
  const bids = ob.bids.map((o) => ({ price: o.price, amount: o.amount }));
  const asks = ob.asks.map((o) => ({ price: o.price, amount: o.amount }));
  const bestBid = bids[0] ? num(bids[0].price) : null;
  const bestAsk = asks[0] ? num(asks[0].price) : null;
  const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
  return {
    pair: `${base}/${quote}`, bids, asks, bestBid, bestAsk, spread,
    spreadPct: spread ? (spread / ((bestAsk + bestBid) / 2)) * 100 : null,
    bidDepth: bids.reduce((s, o) => s + num(o.amount), 0),
    askDepth: asks.reduce((s, o) => s + num(o.amount), 0),
    reference: REF[`${base}/${quote}`],
  };
}
export async function rates() {
  return Promise.all(PAIRS.map(([b, q]) => orderbook(b, q)));
}

// ---------- YC04: tạo / cập nhật / hủy offer ----------
async function latestOfferId(pub, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await server.offers().forAccount(pub).order('desc').limit(1).call();
    if (r.records[0]) return r.records[0].id;
    await sleep(1500);
  }
  return null;
}

/** side 'ask': bán `amount` base để lấy quote ở giá `price` (quote/base).
 *  side 'bid': mua `amount` base bằng quote ở giá `price`. offerId > 0 => cập nhật offer đã có. */
export async function placeOffer({ role, side, base, quote, amount, price, offerId = 0 }) {
  if (!['ask', 'bid'].includes(side)) throw new AppError('side phải là ask hoặc bid');
  if (!(num(amount) > 0) || !(num(price) > 0)) throw new AppError('Số lượng và giá phải lớn hơn 0');
  const B = assetOf(base); const Q = assetOf(quote);
  const op = side === 'ask'
    ? Operation.manageSellOffer({ selling: B, buying: Q, amount: String(amount), price: String(price), offerId: String(offerId) })
    : Operation.manageBuyOffer({ selling: Q, buying: B, buyAmount: String(amount), price: String(price), offerId: String(offerId) });
  const r = await submit(role, [op], offerId ? `offer_update_${side}` : `offer_create_${side}`, { base, quote, amount, price, offerId });
  const id = offerId ? String(offerId) : await latestOfferId(pubOf(role));
  return { ...r, offerId: id };
}

export async function cancelOffer({ role, offerId }) {
  let o;
  try { o = await server.offers().offer(String(offerId)).call(); } catch { throw new AppError('Không tìm thấy offer (có thể đã khớp hết hoặc đã hủy)', 404); }
  if (o.seller !== pubOf(role)) throw new AppError('Offer này không thuộc tài khoản đang thao tác', 403);
  const op = Operation.manageSellOffer({ selling: toAsset(o.selling), buying: toAsset(o.buying), amount: '0', price: o.price, offerId: String(offerId) });
  return submit(role, [op], 'offer_cancel', { offerId });
}

export async function offersOf(role) {
  const r = await server.offers().forAccount(pubOf(role)).limit(100).call();
  return r.records.map((o) => ({
    id: o.id,
    selling: codeToSym(o.selling.asset_code), buying: codeToSym(o.buying.asset_code),
    amount: o.amount, price: o.price,
  }));
}

// ---------- YC06, YC07: giao dịch và chuyển đổi tài sản qua Stellar DEX ----------
export async function quote({ from, to, amount }) {
  const paths = await server.strictSendPaths(assetOf(from), String(amount), [assetOf(to)]).call();
  const best = paths.records.sort((a, b) => num(b.destination_amount) - num(a.destination_amount))[0];
  if (!best) throw new AppError('Không đủ thanh khoản: không tìm thấy đường đi giữa hai tài sản với số lượng này', 422);
  return { receive: best.destination_amount, rate: num(best.destination_amount) / num(amount), path: best.path };
}

export async function swap({ role = 'user1', from, to, amount, slippage = 0.01 }) {
  if (from === to) throw new AppError('Hai tài sản phải khác nhau');
  if (!(num(amount) > 0)) throw new AppError('Số lượng phải lớn hơn 0');
  const q = await quote({ from, to, amount });
  const destMin = (num(q.receive) * (1 - slippage)).toFixed(7);
  const op = Operation.pathPaymentStrictSend({
    sendAsset: assetOf(from), sendAmount: String(amount), destination: pubOf(role),
    destAsset: assetOf(to), destMin, path: q.path.map(toAsset),
  });
  const r = await submit(role, [op], 'swap', { from, to, amount, expected: q.receive, destMin });
  return { ...r, sent: amount, expected: q.receive, destMin };
}

export async function trades(base, quote, limit = 20) {
  const r = await server.trades().forAssetPair(assetOf(base), assetOf(quote)).order('desc').limit(limit).call();
  return r.records.map((t) => ({
    time: t.ledger_close_time, price: `${t.price.n / t.price.d}`.slice(0, 10),
    baseAmount: t.base_amount, counterAmount: t.counter_amount,
    baseAccount: t.base_account, counterAccount: t.counter_account, id: t.id,
  }));
}

// ---------- YC08: dashboard thanh khoản và hiệu quả market maker ----------
export async function dashboard() {
  const accs = loadAccounts();
  const books = await rates();
  const mms = [];
  for (const role of ['mm1', 'mm2']) {
    const pub = accs[role].public;
    const [offers, tr, info] = await Promise.all([
      offersOf(role),
      server.trades().forAccount(pub).order('desc').limit(200).call(),
      server.loadAccount(pub),
    ]);
    const volume = {};
    for (const t of tr.records) {
      const k = `${codeToSym(t.base_asset_code)}/${codeToSym(t.counter_asset_code)}`;
      volume[k] = (volume[k] || 0) + num(t.base_amount);
    }
    const balances = {};
    for (const b of info.balances) balances[b.asset_type === 'native' ? 'XLM' : codeToSym(b.asset_code)] = b.balance;
    mms.push({ role, openOffers: offers.length, trades: tr.records.length, volume, balances });
  }
  return {
    liquidity: books.map((b) => ({
      pair: b.pair, bestBid: b.bestBid, bestAsk: b.bestAsk, spreadPct: b.spreadPct, bidDepth: b.bidDepth, askDepth: b.askDepth,
    })),
    marketMakers: mms,
  };
}

export { explain, SYMBOLS };
