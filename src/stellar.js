import {
  Keypair, Horizon, Asset, TransactionBuilder, Networks, BASE_FEE,
} from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logTx } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ACCOUNTS_FILE = path.join(__dirname, '..', 'accounts.json');
export const EVIDENCE_FILE = path.join(__dirname, '..', 'evidence.json');

export const server = new Horizon.Server('https://horizon-testnet.stellar.org');
export const EXPLORER = 'https://stellar.expert/explorer/testnet';

// Mã tài sản Stellar chỉ cho phép chữ và số (1-12 ký tự), nên "USD-DEMO" được mã hóa thành USDDEMO.
export const CODES = { USD: 'USDDEMO', EUR: 'EURDEMO', GBP: 'GBPDEMO' };
export const SYMBOLS = Object.keys(CODES);
export const ROLES = ['issuer', 'mm1', 'mm2', 'user1'];
// Cặp niêm yết: base/quote, giá = số quote cho 1 base
export const PAIRS = [['EUR', 'USD'], ['GBP', 'USD'], ['EUR', 'GBP']];
// Tỷ giá tham chiếu giả lập (không phải dữ liệu thị trường thật)
export const REF = { 'EUR/USD': 1.08, 'GBP/USD': 1.27, 'EUR/GBP': 1.08 / 1.27 };

export class AppError extends Error {
  constructor(message, status = 400, codes = null) {
    super(message); this.status = status; this.codes = codes;
  }
}

export function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) throw new AppError('Chưa có accounts.json - hãy chạy: npm run setup', 500);
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}
export function saveAccounts(a) { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(a, null, 2)); }
export function assetOf(sym) {
  if (!CODES[sym]) throw new AppError(`Tài sản không hợp lệ: ${sym}`);
  return new Asset(CODES[sym], loadAccounts().issuer.public);
}
export function toAsset(a) {
  return a.asset_type === 'native' ? Asset.native() : new Asset(a.asset_code, a.asset_issuer);
}
export function pubOf(role) {
  const acc = loadAccounts()[role];
  if (!acc) throw new AppError(`Vai trò không tồn tại: ${role}`);
  return acc.public;
}

const MESSAGES = {
  op_underfunded: 'Không đủ số dư để thực hiện giao dịch',
  op_under_dest_min: 'Không đủ thanh khoản: số tiền nhận được thấp hơn mức tối thiểu',
  op_too_few_offers: 'Không đủ thanh khoản: sổ lệnh không có đủ offer để khớp',
  op_no_trust: 'Tài khoản nhận chưa thiết lập trustline cho tài sản này',
  op_src_no_trust: 'Tài khoản gửi chưa thiết lập trustline cho tài sản này',
  op_line_full: 'Trustline đã đầy hạn mức',
  op_cross_self: 'Offer cắt chéo với offer của chính tài khoản này',
  op_offer_not_found: 'Không tìm thấy offer',
  op_sell_no_trust: 'Chưa có trustline cho tài sản bán',
  op_buy_no_trust: 'Chưa có trustline cho tài sản mua',
  tx_bad_seq: 'Sai số thứ tự giao dịch (sequence), hãy thử lại',
  tx_insufficient_balance: 'Không đủ XLM để duy trì số dư tối thiểu',
};

export function explain(e) {
  const rc = e?.response?.data?.extras?.result_codes;
  if (rc) {
    const codes = [rc.transaction, ...(rc.operations || [])].filter(Boolean);
    const known = codes.map((c) => MESSAGES[c]).find(Boolean);
    return new AppError(known || `Giao dịch bị từ chối: ${codes.join(', ')}`, 422, codes);
  }
  return new AppError(e?.message || 'Lỗi không xác định khi gọi Horizon', 502);
}

function appendEvidence(entry) {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(EVIDENCE_FILE, 'utf8')); } catch { /* chưa có file */ }
  arr.push(entry);
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(arr, null, 2));
}

/** Ký bằng khóa của `role` (khóa chỉ nằm ở server) và gửi lên Stellar Testnet. */
export async function submit(role, operations, type, detail = {}) {
  const acc = loadAccounts()[role];
  const keypair = Keypair.fromSecret(acc.secret);
  try {
    const account = await server.loadAccount(keypair.publicKey());
    const b = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).setTimeout(60);
    operations.forEach((o) => b.addOperation(o));
    const tx = b.build();
    tx.sign(keypair);
    const res = await server.submitTransaction(tx);
    const out = { hash: res.hash, ledger: res.ledger, url: `${EXPLORER}/tx/${res.hash}` };
    appendEvidence({ time: new Date().toISOString(), role, type, ...out, detail });
    await logTx({ role, type, hash: res.hash, success: true, detail });
    return out;
  } catch (e) {
    const err = e instanceof AppError ? e : explain(e);
    await logTx({ role, type, hash: null, success: false, detail, error: err.message });
    throw err;
  }
}

export async function friendbot(publicKey) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!r.ok) throw new Error(`Friendbot lỗi ${r.status}: ${await r.text()}`);
  return r.json();
}
export const newKeypair = () => { const k = Keypair.random(); return { public: k.publicKey(), secret: k.secret() }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
