import pg from 'pg';

const memory = [];
let pool = null;

export async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.log('[db] Không có DATABASE_URL - log giao dịch chỉ lưu trong bộ nhớ.');
    return;
  }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query(`CREATE TABLE IF NOT EXISTS tx_log (
    id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    role TEXT NOT NULL, type TEXT NOT NULL, hash TEXT, success BOOLEAN NOT NULL,
    detail JSONB, error TEXT)`);
  console.log('[db] Đã kết nối PostgreSQL.');
}

export async function logTx({ role, type, hash, success, detail, error }) {
  const row = { created_at: new Date().toISOString(), role, type, hash, success, detail, error: error || null };
  memory.unshift(row);
  if (memory.length > 200) memory.pop();
  if (pool) {
    try {
      await pool.query(
        'INSERT INTO tx_log(role,type,hash,success,detail,error) VALUES($1,$2,$3,$4,$5,$6)',
        [role, type, hash, success, JSON.stringify(detail || {}), error || null],
      );
    } catch (e) { console.error('[db] ghi log lỗi:', e.message); }
  }
}

export async function recentLog(limit = 50) {
  if (pool) {
    const r = await pool.query('SELECT * FROM tx_log ORDER BY id DESC LIMIT $1', [limit]);
    return r.rows;
  }
  return memory.slice(0, limit);
}
