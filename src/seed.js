// YC04: mỗi market maker niêm yết bid/ask cho 3 cặp, với spread khác nhau.
import { PAIRS, REF } from './stellar.js';
import { placeOffer } from './service.js';

const HALF_SPREAD = { mm1: 0.0010, mm2: 0.0018 }; // mm1 chặt hơn mm2
const AMOUNT = '50000';

for (const mm of ['mm1', 'mm2']) {
  for (const [base, quote] of PAIRS) {
    const ref = REF[`${base}/${quote}`];
    const bid = (ref * (1 - HALF_SPREAD[mm])).toFixed(5);
    const ask = (ref * (1 + HALF_SPREAD[mm])).toFixed(5);
    for (const [side, price] of [['bid', bid], ['ask', ask]]) {
      const r = await placeOffer({ role: mm, side, base, quote, amount: AMOUNT, price });
      console.log(`${mm} ${base}/${quote} ${side} ${AMOUNT} @ ${price} -> offer ${r.offerId} ${r.url}`);
    }
  }
}
console.log('\nXong. Bước tiếp theo: npm start');
