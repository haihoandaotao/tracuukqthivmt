const path = require('path');
const express = require('express');
const ejsLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const XLSX = require('xlsx');
const csrf = require('csurf');
const bcrypt = require('bcrypt');

const config = require('./config');
const db = require('./db');

const app = express();

// Init DB and ensure data directory exists
const fs = require('fs');
const dataDir = config.dataDir;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
db.init();

// Security headers
app.use(helmet());

// Static files and view engine
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');
app.use(ejsLayouts);
app.set('layout', 'layout');

// Body parsing
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(
  session({
    name: 'sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,  // Changed to true to ensure session is created
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);

// Rate limiter for lookup endpoint
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimitLookup,
});

// CSRF protection for admin routes
const csrfProtection = csrf();

// Multer (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Helpers
function isAuthenticated(req) {
  return !!req.session?.user;
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) return res.redirect('/admin/login');
  next();
}

// Locals
app.use((req, res, next) => {
  res.locals.appTitle = 'TRA CỨU KẾT QUẢ KỲ THI ĐÁNH GIÁ NĂNG LỰC MỸ THUẬT 2026';
  res.locals.university = 'Trường Đại học Kiến trúc Đà Nẵng';
  // Split heading into two lines for the hero
  res.locals.titleLine1 = 'TRA CỨU KẾT QUẢ';
  res.locals.titleLine2 = 'KỲ THI ĐÁNH GIÁ NĂNG LỰC MỸ THUẬT 2026';
  res.locals.user = req.session.user || null;
  next();
});

// Routes: Public lookup
app.get('/', (req, res) => {
  res.render('index', { result: null, error: null, query: '' });
});

app.post('/lookup', lookupLimiter, (req, res) => {
  const cccd = (req.body.cccd || '').trim();
  if (!cccd) {
    return res.render('index', { result: null, error: 'Vui lòng nhập số CCCD.', query: '' });
  }
  // Optional: validate CCCD length (Vietnam CCCD usually 12 digits)
  // if (!/^\d{12}$/.test(cccd)) { ... }

  const result = db.findByCCCD(cccd);
  if (!result) {
    return res.render('index', {
      result: null,
      error: 'Không tìm thấy kết quả. Vui lòng kiểm tra lại số CCCD hoặc liên hệ Ban tuyển sinh để được hỗ trợ.',
      query: cccd,
    });
  }
  res.render('index', { result, error: null, query: cccd });
});

// Routes: Admin auth
app.get('/admin/login', csrfProtection, (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  res.render('admin/login', { error: null, csrfToken: req.csrfToken() });
});

app.post('/admin/login', csrfProtection, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).render('admin/login', { error: 'Thiếu thông tin đăng nhập.', csrfToken: req.csrfToken() });
  }
  if (username !== config.adminUsername) {
    return res.status(401).render('admin/login', { error: 'Sai tên đăng nhập hoặc mật khẩu.', csrfToken: req.csrfToken() });
  }
  const ok = config.adminPasswordHash
    ? await bcrypt.compare(password, config.adminPasswordHash)
    : false;
  if (!ok) {
    return res.status(401).render('admin/login', { error: 'Sai tên đăng nhập hoặc mật khẩu.', csrfToken: req.csrfToken() });
  }
  req.session.user = { username };
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.redirect('/admin/login');
  });
});

// Admin dashboard
app.get('/admin', requireAuth, csrfProtection, (req, res) => {
  res.render('admin/dashboard', { success: null, error: null, csrfToken: req.csrfToken() });
});

// Download Excel template
app.get('/admin/template.xlsx', requireAuth, (req, res) => {
  const wb = XLSX.utils.book_new();
  const a1 = 8.5, b1 = 7.5;
  const a2 = 7.0, b2 = 9.0;
  const total1 = Math.round((((a1 + b1) / 2 + Number.EPSILON) * 100)) / 100;
  const total2 = Math.round((((a2 + b2) / 2 + Number.EPSILON) * 100)) / 100;
  const data = [
    ['CCCD', 'HoTen', 'SoBaoDanh', 'NgaySinh', 'Diem_TracNghiem', 'Diem_VeTinhVat', 'Diem_TongHop'],
    ['001234567890', 'Nguyễn Văn A', 'MT0001', '01/01/2008', a1, b1, total1],
    ['001234567891', 'Trần Thị B', 'MT0002', '02/02/2008', a2, b2, total2],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'KetQua');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="mau_import_ket_qua.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Import handler
// Important: for multipart/form-data, parse with multer BEFORE csrfProtection
app.post('/admin/import', requireAuth, upload.single('file'), csrfProtection, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).render('admin/dashboard', { error: 'Vui lòng chọn file Excel (.xlsx).', success: null, csrfToken: req.csrfToken() });
    }
    const wipe = !!req.body.wipe;
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Normalize headers mapping (case-insensitive)
    const normalized = json.map((row) => {
      const get = (keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find((x) => x.toLowerCase() === k.toLowerCase());
          if (found) return row[found];
        }
        return '';
      };
      const item = {
        cccd: String(get(['CCCD'])).trim(),
        ho_ten: String(get(['HoTen', 'HọTên', 'Họ và tên', 'Ho va ten'])).trim(),
        so_bao_danh: String(get(['SoBaoDanh', 'SBD', 'Số báo danh'])).trim(),
        ngay_sinh: String(get(['NgaySinh', 'Ngày sinh', 'DOB'])).trim(),
        diem_trac_nghiem: Number(get(['Diem_TracNghiem', 'DiemTracNghiem', 'TracNghiem'])),
        diem_ve_tinh_vat: Number(get(['Diem_VeTinhVat', 'DiemVeTinhVat', 'VeTinhVat'])),
        diem_tong_hop_input: Number(get(['Diem_TongHop', 'DiemTongHop', 'Điểm tổng hợp', 'Diem Tong Hop', 'Diem_TongKet', 'DiemTongKet'])),
      };
      return item;
    });

    // Basic validation and filtering
    const valid = [];
    for (const r of normalized) {
      if (!r.cccd || !r.ho_ten || !r.so_bao_danh || !r.ngay_sinh) continue;
      if (Number.isNaN(r.diem_trac_nghiem)) r.diem_trac_nghiem = 0;
      if (Number.isNaN(r.diem_ve_tinh_vat)) r.diem_ve_tinh_vat = 0;
      valid.push(r);
    }
    if (valid.length === 0) {
      return res.status(400).render('admin/dashboard', { error: 'File không có dữ liệu hợp lệ.', success: null, csrfToken: req.csrfToken() });
    }

    // Compare provided 'Diem_TongHop' with system computed value (if provided)
    let mismatch = 0;
    for (const r of valid) {
      if (Number.isFinite(r.diem_tong_hop_input)) {
        const expected = db.computeTotal(r, { weightTracNghiem: config.weightTracNghiem, weightVeTinhVat: config.weightVeTinhVat });
        if (Math.abs(expected - r.diem_tong_hop_input) > 0.01) mismatch++;
      }
    }

    if (wipe) db.deleteAll();
    db.upsertMany(valid, { weightTracNghiem: config.weightTracNghiem, weightVeTinhVat: config.weightVeTinhVat });

    const msg = mismatch > 0
      ? `Đã nhập thành công ${valid.length} kết quả (có ${mismatch} dòng 'Điểm tổng hợp' không khớp, hệ thống đã tính lại).`
      : `Đã nhập thành công ${valid.length} kết quả.`;
    return res.render('admin/dashboard', { success: msg, error: null, csrfToken: req.csrfToken() });
  } catch (err) {
    console.error(err);
    return res.status(500).render('admin/dashboard', { error: 'Lỗi xử lý file. Vui lòng kiểm tra cấu trúc hoặc dữ liệu.', success: null, csrfToken: req.csrfToken() });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// CSRF error handler for nicer messages
app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    if (req.path.startsWith('/admin')) {
      // Recreate token for re-rendering the form
      try {
        const token = csrfProtection(req, res, () => req.csrfToken());
        return res.status(403).render('admin/dashboard', {
          error: 'Phiên làm việc hết hạn hoặc CSRF token không hợp lệ. Vui lòng thử lại.',
          success: null,
          csrfToken: req.csrfToken(),
        });
      } catch (e) {
        return res.status(403).send('Forbidden: CSRF token invalid.');
      }
    }
    return res.status(403).send('Forbidden: CSRF token invalid.');
  }
  next(err);
});

// Start server
app.listen(config.port, () => {
  console.log(`Server đang chạy tại http://localhost:${config.port}`);
});
