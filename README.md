# Tra cứu Kết quả thi Đánh giá năng lực Mỹ thuật 2026

Đơn vị: Trường Đại học Kiến trúc Đà Nẵng

Ứng dụng web đơn giản, bảo mật, cho phép:
- Thí sinh tra cứu điểm bằng số CCCD
- Quản trị viên upload file Excel để cập nhật CSDL điểm thi

## Tính năng
- Tra cứu nhanh theo CCCD (< 1s trên SQLite, có chỉ mục)
- Import Excel (.xlsx), tự tính điểm tổng kết theo trọng số cấu hình
- Tuỳ chọn xóa dữ liệu cũ trước khi import
- Đăng nhập quản trị có phiên làm việc (session), CSRF cho form admin, Helmet, giới hạn tần suất truy vấn
- Giao diện đơn giản, responsive (Bootstrap)

## Yêu cầu hệ thống
- Node.js 18+ (khuyến nghị 20+)
- Windows/PowerShell (hướng dẫn dưới dùng PowerShell)

## Cài đặt

```powershell
# 1) Sao chép file cấu hình
Copy-Item .env.example .env

# 2) Tạo mật khẩu quản trị (ví dụ: "MatKhau@2026")
# Sinh hash bằng script tiện ích
npm run hash -- "MatKhau@2026"
# Copy chuỗi hash in ra, dán vào biến ADMIN_PASSWORD_HASH trong file .env

# 3) Chỉnh sửa .env (tên đăng nhập, secret, trọng số, cổng...)
# Mặc định USER=admin, PORT=3000

# 4) Chạy ứng dụng
npm run dev   # chạy dev (tự reload)
# hoặc
npm start     # chạy production đơn giản
```

Sau khi chạy, truy cập:
- Trang tra cứu: http://localhost:3000/
- Đăng nhập admin: http://localhost:3000/admin/login
- Bảng điều khiển admin: http://localhost:3000/admin
- Tải mẫu Excel: http://localhost:3000/admin/template.xlsx

## Cấu trúc file Excel
Dùng đúng tiêu đề cột (không phân biệt hoa thường; app có hỗ trợ một số biến thể):

| CCCD | HoTen | SoBaoDanh | NgaySinh | Diem_TracNghiem | Diem_VeTinhVat | Diem_TongHop |
| :--- | :---- | :-------- | :------- | :-------------- | :------------- | :----------- |
| 0012... | Nguyễn Văn A | MT0001 | 01/01/2008 | 8.5 | 7.5 | 16.0 |
| 0013... | Trần Thị B | MT0002 | 02/02/2008 | 7.0 | 9.0 | 16.0 |

Ghi chú:
- Cột `Diem_TongHop` là tùy chọn (optional). Nếu có, hệ thống sẽ kiểm tra và so sánh với giá trị tự tính; nếu không khớp, hệ thống vẫn dùng giá trị tự tính và báo số dòng lệch.
- Bạn có thể tải file mẫu có sẵn cột `Diem_TongHop` tại trang quản trị.

Điểm tổng hợp sẽ được hệ thống tự tính theo công thức:
```
Điểm tổng hợp = (Diem_TracNghiem + Diem_VeTinhVat) / 2
```
Giá trị sẽ được làm tròn 2 chữ số thập phân khi lưu.

## Bảo mật
- Tuyến admin bắt buộc đăng nhập; phiên lưu bằng session cookie (httpOnly)
- Helmet đặt header bảo mật phổ biến
- CSRF áp dụng cho form đăng nhập và import
- Giới hạn tần suất (/lookup) để tránh lạm dụng
- Mật khẩu lưu dạng hash (bcrypt)

Khuyến nghị khi triển khai thực tế:
- Chạy sau reverse proxy HTTPS (và đặt cookie.secure=true)
- Tạo tài khoản admin với mật khẩu mạnh, đổi SESSION_SECRET
- Sao lưu file cơ sở dữ liệu: `data/results.db`

## Thư mục dự án
- src/server.js: Điểm vào ứng dụng Express
- src/db.js: Kết nối/khởi tạo SQLite, thao tác dữ liệu
- src/config.js: Đọc biến môi trường, cấu hình
- views/: Giao diện EJS
- public/: Tài nguyên tĩnh (CSS, ảnh)
- data/: CSDL SQLite (tự tạo khi chạy)
- scripts/hash.js: Tạo bcrypt hash cho mật khẩu admin

## Sự cố thường gặp
- Lỗi đọc file Excel: kiểm tra tiêu đề cột, đúng định dạng .xlsx
- Không đăng nhập được: kiểm tra ADMIN_USERNAME/ADMIN_PASSWORD_HASH trong .env
- Port bận: đổi PORT trong .env

## Giấy phép
MIT

## Triển khai lên Render

Tùy chọn 1: Dùng Render Blueprint (render.yaml)
1) Đẩy mã nguồn này lên GitHub riêng của bạn.
2) Trên Render, chọn New + Blueprint, trỏ đến repo.
3) Render sẽ đọc `render.yaml` và tạo Web Service kèm ổ đĩa (Disk) 1GB tại `/var/data`.
4) Tại trang Service > Environment, dán giá trị `ADMIN_PASSWORD_HASH` (hash bcrypt từ `npm run hash -- "MatKhau@2026"`).
5) Deploy. Sau khi xong, truy cập domain Render cấp sẵn.

Tùy chọn 2: Tạo Web Service thủ công
1) New > Web Service, kết nối repo GitHub.
2) Runtime Node; Build Command: `npm install`; Start Command: `npm start`.
3) Tạo Disk (ví dụ 1GB) và mount vào `/var/data`.
4) Environment variables:
	- NODE_ENV=production
	- SESSION_SECRET=(tạo chuỗi ngẫu nhiên)
	- ADMIN_USERNAME=admin
	- ADMIN_PASSWORD_HASH=(dán hash bcrypt)
	- DATA_DIR=/var/data
	- RATE_LIMIT_LOOKUP=120
5) Deploy.

Ghi chú: SQLite sẽ được lưu tại `${DATA_DIR}/results.db`. Không dùng file trong repo để tránh mất dữ liệu khi redeploy.
