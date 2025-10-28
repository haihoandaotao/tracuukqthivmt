require('dotenv').config();

const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  sessionSecret: process.env.SESSION_SECRET || 'change-this-secret',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  dataDir: process.env.DATA_DIR || require('path').join(__dirname, '..', 'data'),
  // Default weights: sum of two scores
  weightTracNghiem: process.env.WEIGHT_TRACNGHIEM ? parseFloat(process.env.WEIGHT_TRACNGHIEM) : 1.0,
  weightVeTinhVat: process.env.WEIGHT_VE_TINH_VAT ? parseFloat(process.env.WEIGHT_VE_TINH_VAT) : 1.0,
  rateLimitLookup: process.env.RATE_LIMIT_LOOKUP ? parseInt(process.env.RATE_LIMIT_LOOKUP, 10) : 60, // requests per minute per IP
};

module.exports = config;
