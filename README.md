# Good Docs v4.0 — GitHub Pages + Google Sheets

Website HTML/CSS/JS chạy TRỰC TIẾP trên GitHub Pages. Google Sheets làm cơ sở dữ liệu qua Google Sheets API, sử dụng Google Identity Services OAuth trong trình duyệt. **Không cần Apps Script, không cần server riêng.**

## Các file deploy lên GitHub

```
index.html       HTML chính
style.css        giao diện Dark Mode + responsive
app.js           ghi chú, Dictionary, auto-save, export/import JSON
sheets.js        Google OAuth + Sheets API + chia nhỏ nội dung và lưu snapshot
config.js        điền 2 giá trị Client ID và Spreadsheet ID
README.md        hướng dẫn này
```

## Bước 1: Chuẩn bị Google Sheets

1. Đăng nhập Google và mở https://sheets.google.com, tạo bảng tính mới tên **Good Docs Database**.
2. Copy **Spreadsheet ID** từ địa chỉ `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.
3. **Giữ bảng tính ở chế độ Restricted / Riêng tư.** Tài khoản Google được sử dụng trên website phải là chủ sở hữu hoặc được chia sẻ quyền Editor.
4. Không cần tạo tab thủ công: lần kết nối thành công đầu tiên, ứng dụng tự tạo `Settings`, `Notes_A`, `Chunks_A`, `Dictionary_A`, `Notes_B`, `Chunks_B`, `Dictionary_B`.

## Bước 2: Tạo OAuth Client ID (làm một lần)

1. Mở https://console.cloud.google.com, tạo hoặc chọn Google Cloud Project.
2. Bật **Google Sheets API** (APIs & Services → Library).
3. Mở **Google Auth Platform** → Branding / Audience / Data access (tên menu thay đổi theo giao diện Google).
4. Cấu hình ứng dụng OAuth; dùng External nếu là tài khoản Gmail cá nhân. Khi ứng dụng ở trạng thái Testing, thêm địa chỉ Gmail của bạn vào **Test users**.
5. Tạo **OAuth client** loại **Web application**.
6. Thêm **Authorized JavaScript origins** chính xác: `https://YOUR_USERNAME.github.io` (KHÔNG thêm `/GoodDocs/` và không thêm dấu `/` cuối). Nếu deploy lên domain riêng, thêm domain tương ứng.
7. Copy OAuth **Client ID** dạng `...apps.googleusercontent.com`.
8. Google có thể cảnh báo quyền truy cập dữ liệu Google Sheets (scope nhạy cảm) khi bạn thử nghiệm. Dùng tài khoản test của chính mình. Công bố ứng dụng cho nhiều người có thể cần hoàn tất quy trình xác minh OAuth theo chính sách Google.

**Không đưa client secret, access token hoặc refresh token vào GitHub!** Client ID và Spreadsheet ID là định danh có thể xuất hiện ở frontend. File Sheets phải luôn được bảo vệ bằng quyền Google.

## Bước 3: Sửa config.js

```js
window.GOODDOCS_CONFIG = Object.freeze({
  clientId: "YOUR_CLIENT_ID.apps.googleusercontent.com",
  spreadsheetId: "YOUR_SPREADSHEET_ID",
  scope: "https://www.googleapis.com/auth/spreadsheets"
});
```

Ứng dụng dùng quyền `spreadsheets` để tạo các tab dữ liệu trong spreadsheet bạn đã chọn và cập nhật nội dung. Google OAuth có thể yêu cầu cấp quyền lại khi hết phiên; **token không được ghi vào localStorage**.

## Bước 4: Deploy GitHub Pages

1. Tạo repository public ví dụ `GoodDocs` (hoặc dùng repository hiện tại).
2. Upload **5 file của website** (`index.html`, `style.css`, `app.js`, `sheets.js`, `config.js`) vào **root** của repository. Có thể upload thêm README.md. Không upload các file Apps Script v3.
3. Chọn **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
4. Truy cập `https://YOUR_USERNAME.github.io/GoodDocs/`.
5. Nhấn **Kết nối Google**, chọn đúng tài khoản đã tạo hoặc được cấp Editor cho Google Sheet, cấp quyền Google Sheets API. Ứng dụng tự khởi tạo các tab Sheets và tải dữ liệu.
6. Tạo ghi chú, gõ văn bản, chờ thông báo **Đã lưu vào Google Sheets ✓**. Mở trình duyệt khác, kết nối cùng tài khoản và kiểm tra dữ liệu.

**Quan trọng:** Browser B cần bấm **Kết nối Google**; mở trang web thôi không tự xác thực. Khi đang mở song song, nhấn **↻ Tải lại** để lấy thay đổi từ thiết bị khác. Đây không phải trình soạn thảo cộng tác realtime.

## Tính năng

- Sidebar cố định Dictionary ở trên "THƯ VIỆN CỦA BẠN".
- Tạo, đổi tên, xóa tab; ghi chú rich-text, in đậm Ctrl+B, cỡ chữ.
- Dictionary 2 cột English / Tiếng Việt; Edit ON/OFF, Add row, Delete, Save; in đậm cả ô đang chọn.
- Bôi đen từ trong ghi chú rồi nhấn chuột phải → Thêm vào Dictionary → nhập nghĩa và Add.
- Tự lưu ghi chú sau 1,4 giây; Dictionary phải nhấn Save.
- Responsive trên điện thoại (menu chuột phải chỉ dành cho máy tính).
- Xuất/nhập JSON làm bản dự phòng.
- Dữ liệu ghi chú được UTF-8→Base64, chia thành chunks **tối đa 30.000 ký tự/ô** (dưới 50.000). Các đoạn nằm trong sheet Chunks_A/B; lúc đọc được ghép và giải mã. Dictionary xuất hiện ở 2 cột đầu của sheet Dictionary_A/B.

## Cơ chế an toàn dữ liệu

- Dùng **hai bộ snapshot A/B**. Ghi toàn bộ dữ liệu vào bộ đang không active rồi mới chuyển con trỏ Settings, giảm nguy cơ mất bản đang dùng khi lỗi mạng giữa chừng.
- Mỗi lần lưu kiểm tra revision, phát hiện phần lớn xung đột đã xảy ra trước khi lưu. **Không có transaction / compare-and-swap thực sự** trong Google Sheets API: hai trình duyệt lưu đồng thời sát nhau vẫn có thể gây ghi đè. **Tránh chỉnh sửa đồng thời** trên nhiều trình duyệt; xuất JSON định kỳ.
- Nếu xuất hiện "Xung đột" hãy **Xuất JSON** ghi lại chỉnh sửa hiện tại trước, sau đó nhấn **Tải lại**; không nên bấm tải lại ngay khi chưa sao lưu.
- Google Sheets không phải database giao dịch; thiết kế này dành cho sử dụng cá nhân và nội dung vừa phải, không cho nhiều người chỉnh sửa cùng lúc.
- Giới hạn phần mềm: 250 ghi chú, 5.000 từ, 2 triệu ký tự HTML / ghi chú và 10.000 chunks / snapshot. Giới hạn API Google và ô Sheets vẫn áp dụng.
- Mỗi người dùng mở link website đều nhìn thấy giao diện, nhưng **chỉ tài khoản Google có quyền đối với spreadsheet** mới đọc/ghi được dữ liệu.
- Dữ liệu nhạy cảm: trình duyệt có thể render nội dung ghi chú, không xem đây là hệ thống lưu bí mật cấp cao. Import HTML được lọc bỏ script/event handlers nguy hiểm.

## Lỗi thường gặp

- `origin_mismatch` / `idpiframe_initialization_failed`: kiểm tra **Authorized JavaScript origins**; chỉ host gồm https và username.github.io, không kèm path, dùng browser cho phép popup/cookie theo yêu cầu Google.
- `403 The caller does not have permission`: mở Sheet bằng tài khoản Google đã kết nối, đảm bảo quyền Editor và Sheets API được bật. Nếu ứng dụng OAuth ở Testing, thêm test user.
- `404 Requested entity was not found`: Spreadsheet ID sai hoặc tài khoản không được cấp quyền.
- `Phiên Google đã hết hạn`: nhấn **Kết nối lại Google**, sau đó lưu. Dữ liệu chưa lưu có thể cần xuất JSON trước nếu trình duyệt báo chưa lưu.
- Các tab không xuất hiện: kiểm tra console devtools và quyền chỉnh sửa Sheets.
- Website dùng trình duyệt khác cần đăng nhập lại, đây là chủ đích bảo mật.

## Tài liệu chính thức

- https://developers.google.com/workspace/sheets/api/quickstart/js
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/sheets/api/reference/rest
