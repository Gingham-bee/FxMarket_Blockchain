// YC01-YC03: tạo tài khoản (issuer, 2 market maker, 1 người dùng), phát hành 3 tài sản, thiết lập trustline.
import { Operation, Asset } from '@stellar/stellar-sdk';
import fs from 'node:fs';
import {
  ACCOUNTS_FILE, EVIDENCE_FILE, CODES, SYMBOLS, newKeypair, saveAccounts, friendbot, submit, loadAccounts,
} from './stellar.js';

if (fs.existsSync(ACCOUNTS_FILE) && !process.argv.includes('--reset')) {
  console.log('accounts.json đã tồn tại. Chạy lại với --reset nếu muốn tạo mới (testnet reset hoặc làm lại từ đầu).');
  process.exit(0);
}
if (fs.existsSync(EVIDENCE_FILE)) fs.unlinkSync(EVIDENCE_FILE);

const accounts = {
  issuer: newKeypair(), mm1: newKeypair(), mm2: newKeypair(), user1: newKeypair(),
};
saveAccounts(accounts);

console.log('1) Cấp XLM testnet qua Friendbot...');
for (const [role, a] of Object.entries(accounts)) {
  await friendbot(a.public);
  console.log(`   ${role}: ${a.public}`);
}

const assets = SYMBOLS.map((s) => new Asset(CODES[s], accounts.issuer.public));

console.log('2) Thiết lập trustline cho mm1, mm2, user1...');
for (const role of ['mm1', 'mm2', 'user1']) {
  const r = await submit(role, assets.map((asset) => Operation.changeTrust({ asset })), 'create_trustline', { assets: SYMBOLS });
  console.log(`   ${role}: ${r.url}`);
}

console.log('3) Issuer phát hành tài sản (payment tới các tài khoản)...');
const grants = { mm1: '200000', mm2: '200000', user1: '10000' };
for (const [role, amount] of Object.entries(grants)) {
  const ops = assets.map((asset) => Operation.payment({ destination: accounts[role].public, asset, amount }));
  const r = await submit('issuer', ops, 'issue_assets', { to: role, amount, assets: SYMBOLS });
  console.log(`   -> ${role} (${amount} mỗi loại): ${r.url}`);
}
console.log('\nXong. Bước tiếp theo: npm run seed');
console.log('Địa chỉ ví công khai:', Object.fromEntries(Object.entries(loadAccounts()).map(([k, v]) => [k, v.public])));
