const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config');

const dbPath = path.join(config.dataDir, 'results.db');
let db;

function connect() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function init() {
  const db = connect();
  db.exec(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cccd TEXT NOT NULL UNIQUE,
      ho_ten TEXT NOT NULL,
      so_bao_danh TEXT NOT NULL,
      ngay_sinh TEXT NOT NULL,
      diem_trac_nghiem REAL NOT NULL,
      diem_ve_tinh_vat REAL NOT NULL,
      diem_tong REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_results_cccd ON results (cccd);
  `);
}

function computeTotal(row, _weightsIgnored) {
  const tn = Number(row.diem_trac_nghiem || 0);
  const ve = Number(row.diem_ve_tinh_vat || 0);
  const total = (tn + ve) / 2; // average as requested
  return Math.round((total + Number.EPSILON) * 100) / 100; // round to 2 decimals
}

function upsertMany(rows, weights) {
  const db = connect();
  const insert = db.prepare(`
    INSERT INTO results (cccd, ho_ten, so_bao_danh, ngay_sinh, diem_trac_nghiem, diem_ve_tinh_vat, diem_tong)
    VALUES (@cccd, @ho_ten, @so_bao_danh, @ngay_sinh, @diem_trac_nghiem, @diem_ve_tinh_vat, @diem_tong)
    ON CONFLICT(cccd) DO UPDATE SET
      ho_ten=excluded.ho_ten,
      so_bao_danh=excluded.so_bao_danh,
      ngay_sinh=excluded.ngay_sinh,
      diem_trac_nghiem=excluded.diem_trac_nghiem,
      diem_ve_tinh_vat=excluded.diem_ve_tinh_vat,
      diem_tong=excluded.diem_tong
  `);

  const tx = db.transaction((list) => {
    for (const r of list) {
      const item = { ...r };
      item.diem_tong = computeTotal(item, weights);
      insert.run(item);
    }
  });

  tx(rows);
}

function deleteAll() {
  const db = connect();
  db.exec('DELETE FROM results');
}

function findByCCCD(cccd) {
  const db = connect();
  const stmt = db.prepare('SELECT * FROM results WHERE cccd = ?');
  return stmt.get(cccd);
}

module.exports = { connect, init, upsertMany, deleteAll, findByCCCD, computeTotal };
