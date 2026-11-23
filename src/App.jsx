import { useEffect, useState, useCallback } from 'react';

const EXPLORER = 'https://stellar.expert/explorer/testnet';
const api = async (path, opts) => {
  const r = await fetch(`/api${path}`, opts && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Lỗi không xác định');
  return data;
};
const short = (s) => `${s.slice(0, 6)}…${s.slice(-6)}`;
const PAIRS = [['EUR', 'USD'], ['GBP', 'USD'], ['EUR', 'GBP']];
const SYMS = ['USD', 'EUR', 'GBP'];

function Tx({ r }) {
  if (!r) return null;
  return <p className="ok">Thành công. Tx: <a href={r.url} target="_blank" rel="noreferrer">{short(r.hash)}</a> (ledger {r.ledger})</p>;
}
const Err = ({ e }) => (e ? <p className="err">Lỗi: {e}</p> : null);

function Accounts() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => { api('/accounts').then(setRows).catch((e) => setErr(e.message)); }, []);
  return (
    <section>
      <h2>Tài khoản và số dư</h2><Err e={err} />
      <table><thead><tr><th>Vai trò</th><th>Địa chỉ</th><th>XLM</th><th>USD-DEMO</th><th>EUR-DEMO</th><th>GBP-DEMO</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.role}><td>{r.role}</td>
            <td><a href={`${EXPLORER}/account/${r.public}`} target="_blank" rel="noreferrer">{short(r.public)}</a></td>
            <td>{r.balances.XLM}</td><td>{r.balances.USD ?? '-'}</td><td>{r.balances.EUR ?? '-'}</td><td>{r.balances.GBP ?? '-'}</td></tr>))}
        </tbody></table>
    </section>
  );
}

function Book() {
  const [rates, setRates] = useState([]);
  const [pair, setPair] = useState('EUR/USD');
  const [ob, setOb] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    const [b, q] = pair.split('/');
    Promise.all([api('/rates'), api(`/orderbook?base=${b}&quote=${q}`)]).then(([r, o]) => { setRates(r); setOb(o); }).catch((e) => setErr(e.message));
  }, [pair]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  return (
    <section>
      <h2>Bảng tỷ giá</h2><Err e={err} />
      <table><thead><tr><th>Cặp</th><th>Bid</th><th>Ask</th><th>Spread</th><th>Spread %</th><th>Tham chiếu (giả lập)</th></tr></thead>
        <tbody>{rates.map((r) => (
          <tr key={r.pair} onClick={() => setPair(r.pair)} className={r.pair === pair ? 'sel' : ''}>
            <td>{r.pair}</td><td>{r.bestBid?.toFixed(5)}</td><td>{r.bestAsk?.toFixed(5)}</td>
            <td>{r.spread?.toFixed(5)}</td><td>{r.spreadPct?.toFixed(3)}%</td><td>{r.reference.toFixed(5)}</td></tr>))}
        </tbody></table>
      <h2>Order book {pair}</h2>
      {ob && (
        <div className="cols">
          <div><h3>Bid (mua)</h3><table><thead><tr><th>Giá</th><th>Số lượng</th></tr></thead>
            <tbody>{ob.bids.map((o, i) => <tr key={i}><td>{o.price}</td><td>{o.amount}</td></tr>)}</tbody></table></div>
          <div><h3>Ask (bán)</h3><table><thead><tr><th>Giá</th><th>Số lượng</th></tr></thead>
            <tbody>{ob.asks.map((o, i) => <tr key={i}><td>{o.price}</td><td>{o.amount}</td></tr>)}</tbody></table></div>
        </div>)}
    </section>
  );
}

function MarketMaker() {
  const [mm, setMm] = useState('mm1');
  const [pair, setPair] = useState('EUR/USD');
  const [side, setSide] = useState('bid');
  const [price, setPrice] = useState('1.0790');
  const [amount, setAmount] = useState('1000');
  const [offers, setOffers] = useState([]);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const refresh = useCallback(() => { api(`/offers/${mm}`).then(setOffers).catch((e) => setErr(e.message)); }, [mm]);
  useEffect(refresh, [refresh]);
  const run = async (fn) => { setErr(''); setRes(null); try { setRes(await fn()); setTimeout(refresh, 2000); } catch (e) { setErr(e.message); } };
  const [base, quote] = pair.split('/');
  return (
    <section>
      <h2>Market maker: tạo, cập nhật, hủy offer</h2>
      <div className="form">
        <select value={mm} onChange={(e) => setMm(e.target.value)}><option>mm1</option><option>mm2</option></select>
        <select value={pair} onChange={(e) => setPair(e.target.value)}>{PAIRS.map((p) => <option key={p}>{p.join('/')}</option>)}</select>
        <select value={side} onChange={(e) => setSide(e.target.value)}><option value="bid">Bid (mua)</option><option value="ask">Ask (bán)</option></select>
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Giá" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Số lượng (base)" />
        <button onClick={() => run(() => api('/offers', { role: mm, side, base, quote, amount, price }))}>Tạo offer</button>
      </div>
      <Tx r={res} /><Err e={err} />
      <h3>Offer đang mở của {mm}</h3>
      <table><thead><tr><th>ID</th><th>Bán</th><th>Mua</th><th>Số lượng bán</th><th>Giá</th><th></th></tr></thead>
        <tbody>{offers.map((o) => (
          <tr key={o.id}><td>{o.id}</td><td>{o.selling}</td><td>{o.buying}</td><td>{o.amount}</td><td>{o.price}</td>
            <td><button onClick={() => run(() => api('/offers/cancel', { role: mm, offerId: o.id }))}>Hủy</button></td></tr>))}
        </tbody></table>
    </section>
  );
}

function Trade() {
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('EUR');
  const [amount, setAmount] = useState('100');
  const [q, setQ] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [trades, setTrades] = useState([]);
  const loadTrades = useCallback(() => { api('/trades?base=EUR&quote=USD').then(setTrades).catch(() => {}); }, []);
  useEffect(loadTrades, [loadTrades]);
  const getQuote = async () => { setErr(''); setRes(null); setQ(null); try { setQ(await api(`/quote?from=${from}&to=${to}&amount=${amount}`)); } catch (e) { setErr(e.message); } };
  const doSwap = async () => { setErr(''); try { setRes(await api('/swap', { from, to, amount })); setQ(null); setTimeout(loadTrades, 2500); } catch (e) { setErr(e.message); } };
  return (
    <section>
      <h2>Giao dịch / chuyển đổi tài sản (user1)</h2>
      <div className="form">
        <select value={from} onChange={(e) => setFrom(e.target.value)}>{SYMS.map((s) => <option key={s}>{s}</option>)}</select>
        <span>→</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>{SYMS.map((s) => <option key={s}>{s}</option>)}</select>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button onClick={getQuote}>Báo giá</button>
        <button onClick={doSwap}>Thực hiện</button>
      </div>
      {q && <p>Nhận dự kiến: <b>{q.receive}</b> {to} (tỷ giá {q.rate.toFixed(5)})</p>}
      <Tx r={res} /><Err e={err} />
      <h3>Lịch sử khớp lệnh EUR/USD</h3>
      <table><thead><tr><th>Thời gian</th><th>Giá</th><th>EUR</th><th>USD</th></tr></thead>
        <tbody>{trades.map((t) => <tr key={t.id}><td>{new Date(t.time).toLocaleString()}</td><td>{t.price}</td><td>{t.baseAmount}</td><td>{t.counterAmount}</td></tr>)}</tbody></table>
    </section>
  );
}

function Dashboard() {
  const [d, setD] = useState(null);
  const [log, setLog] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setErr(e.message)); api('/log').then(setLog).catch(() => {}); }, []);
  return (
    <section>
      <h2>Dashboard thanh khoản và market maker</h2><Err e={err} />
      {d && (<>
        <h3>Thanh khoản theo cặp</h3>
        <table><thead><tr><th>Cặp</th><th>Bid</th><th>Ask</th><th>Spread %</th><th>Độ sâu bid</th><th>Độ sâu ask</th></tr></thead>
          <tbody>{d.liquidity.map((l) => (<tr key={l.pair}><td>{l.pair}</td><td>{l.bestBid?.toFixed(5)}</td><td>{l.bestAsk?.toFixed(5)}</td>
            <td>{l.spreadPct?.toFixed(3)}%</td><td>{l.bidDepth.toFixed(0)}</td><td>{l.askDepth.toFixed(0)}</td></tr>))}</tbody></table>
        <h3>Hiệu quả market maker</h3>
        <table><thead><tr><th>MM</th><th>Offer mở</th><th>Số lần khớp</th><th>Khối lượng khớp (base)</th><th>Số dư USD/EUR/GBP</th></tr></thead>
          <tbody>{d.marketMakers.map((m) => (<tr key={m.role}><td>{m.role}</td><td>{m.openOffers}</td><td>{m.trades}</td>
            <td>{Object.entries(m.volume).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join('; ') || '-'}</td>
            <td>{m.balances.USD} / {m.balances.EUR} / {m.balances.GBP}</td></tr>))}</tbody></table>
      </>)}
      <h3>Nhật ký giao dịch</h3>
      <table><thead><tr><th>Thời gian</th><th>Vai trò</th><th>Loại</th><th>Kết quả</th><th>Tx / lỗi</th></tr></thead>
        <tbody>{log.map((l, i) => (<tr key={i}><td>{new Date(l.created_at).toLocaleTimeString()}</td><td>{l.role}</td><td>{l.type}</td>
          <td>{l.success ? 'OK' : 'Lỗi'}</td>
          <td>{l.hash ? <a href={`${EXPLORER}/tx/${l.hash}`} target="_blank" rel="noreferrer">{short(l.hash)}</a> : l.error}</td></tr>))}</tbody></table>
    </section>
  );
}

const TABS = { 'Tài khoản': Accounts, 'Tỷ giá & Order book': Book, 'Market maker': MarketMaker, 'Giao dịch': Trade, Dashboard };
export default function App() {
  const [tab, setTab] = useState('Tài khoản');
  const View = TABS[tab];
  return (
    <div className="app">
      <h1>FXMarket – sàn ngoại tệ trên Stellar Testnet</h1>
      <nav>{Object.keys(TABS).map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
      <View key={tab} />
    </div>
  );
}
