// Chạy MỘT LẦN để khôi phục bid EUR/USD của mm1 về 1.07892 (do lỗi cũ của TC08 đã đặt sai giá).
import * as svc from './service.js';

const offers = await svc.offersOf('mm1');
const bid = offers.find((o) => o.selling === 'USD' && o.buying === 'EUR');
if (!bid) { console.log('Không tìm thấy bid EUR/USD của mm1'); process.exit(1); }
const r = await svc.placeOffer({ role: 'mm1', side: 'bid', base: 'EUR', quote: 'USD', amount: '50000', price: '1.07892', offerId: bid.id });
console.log('Đã khôi phục bid mm1, tx:', r.url);
await new Promise((res) => setTimeout(res, 2000));
const ob = await svc.orderbook('EUR', 'USD');
console.log('Order book EUR/USD: bestBid =', ob.bestBid, '| bestAsk =', ob.bestAsk);
