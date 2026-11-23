// Chạy: npm test  (sau khi đã setup + seed). In ra PASS/FAIL và transaction hash để đưa vào báo cáo mục kiểm thử.
import * as svc from './service.js';
import { pubOf, server, sleep } from './stellar.js';

const results = [];
async function tc(id, name, fn) {
  try {
    const out = await fn();
    results.push({ id, name, status: out.pass ? 'PASS' : 'FAIL', note: out.note });
  } catch (e) {
    results.push({ id, name, status: 'ERROR', note: e.message });
  }
  const r = results.at(-1);
  console.log(`${r.id} [${r.status}] ${r.name}\n    ${r.note}`);
}
const expectFail = async (fn) => {
  try { await fn(); return { pass: false, note: 'Giao dịch lẽ ra phải bị từ chối nhưng đã thành công' }; }
  catch (e) { return { pass: true, note: `Bị từ chối đúng: ${e.message}${e.codes ? ` [${e.codes.join(', ')}]` : ''}` }; }
};

await tc('TC01', 'Giao dịch thành công: user1 đổi 100 USD -> EUR', async () => {
  const r = await svc.swap({ from: 'USD', to: 'EUR', amount: '100' });
  return { pass: !!r.hash, note: `nhận dự kiến ${r.expected} EUR, tx ${r.url}` };
});
await tc('TC02', 'Không đủ số dư: đổi 20000 USD (user1 chỉ có ~10000)', () =>
  expectFail(() => svc.swap({ from: 'USD', to: 'EUR', amount: '20000' })));
await tc('TC03', 'Không có thanh khoản: đổi 5.000.000 USD -> EUR', () =>
  expectFail(() => svc.swap({ from: 'USD', to: 'EUR', amount: '5000000' })));

let uid;
await tc('TC04', 'Offer không được khớp: user1 bán EUR giá 2.0 USD (cao hơn thị trường)', async () => {
  const r = await svc.placeOffer({ role: 'user1', side: 'ask', base: 'EUR', quote: 'USD', amount: '10', price: '2.0' });
  uid = r.offerId;
  await sleep(1500);
  const open = (await svc.offersOf('user1')).some((o) => o.id === String(uid));
  return { pass: open, note: `offer ${uid} vẫn nằm trong order book, tx ${r.url}` };
});
await tc('TC05', 'Cập nhật offer: đổi giá từ 2.0 xuống 1.9', async () => {
  const r = await svc.placeOffer({ role: 'user1', side: 'ask', base: 'EUR', quote: 'USD', amount: '10', price: '1.9', offerId: uid });
  await sleep(1500);
  const o = (await svc.offersOf('user1')).find((x) => x.id === String(uid));
  return { pass: o && Number(o.price) === 1.9, note: `giá hiện tại ${o?.price}, tx ${r.url}` };
});
await tc('TC06', 'Hủy offer', async () => {
  const r = await svc.cancelOffer({ role: 'user1', offerId: uid });
  await sleep(1500);
  const gone = !(await svc.offersOf('user1')).some((o) => o.id === String(uid));
  return { pass: gone, note: `offer ${uid} đã biến mất, tx ${r.url}` };
});
await tc('TC07', 'Hủy offer của người khác (mm1 offer) bị chặn', async () => {
  const [first] = await svc.offersOf('mm1');
  return expectFail(() => svc.cancelOffer({ role: 'user1', offerId: first.id }));
});
await tc('TC08', 'Market maker cập nhật giá: mm1 tăng bid EUR/USD thêm 0.0001', async () => {
  const before = await svc.orderbook('EUR', 'USD');
  const offers = await svc.offersOf('mm1');
  // Offer bid được lưu dưới dạng "bán USD, mua EUR" nên price trong danh sách là EUR/USD; đảo lại để ra USD cho 1 EUR
  const bid = offers.find((o) => o.selling === 'USD' && o.buying === 'EUR');
  const bidUsdPerEur = 1 / Number(bid.price);
  const newPrice = (bidUsdPerEur + 0.0001).toFixed(5);
  const r = await svc.placeOffer({ role: 'mm1', side: 'bid', base: 'EUR', quote: 'USD', amount: '50000', price: newPrice, offerId: bid.id });
  await sleep(1500);
  const after = await svc.orderbook('EUR', 'USD');
  return { pass: after.bestBid > before.bestBid, note: `bestBid ${before.bestBid} -> ${after.bestBid}, tx ${r.url}` };
});

const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\nKết quả: ${pass}/${results.length} PASS`);
console.log('Tài khoản user1:', pubOf('user1'), '| Horizon:', server.serverURL.toString());
