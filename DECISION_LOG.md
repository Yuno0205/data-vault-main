# DECISION LOG

## 1. Problem Framing

Bài toán yêu cầu xây dựng một hệ thống quản lý dữ liệu hiệu suất cao trong trình duyệt, với các ràng buộc:

- UI (Main App) không được truy cập trực tiếp dữ liệu
- Data Vault phải hoạt động độc lập
- Giao tiếp thông qua messaging bất đồng bộ
- Xử lý được khối lượng dữ liệu lớn (50,000+ records)
- UI phải luôn responsive (không bị freeze)

Về bản chất, đây là một bài toán mô phỏng kiến trúc phân tán (distributed system) ở phía frontend.

---

## 2. Technical Architecture

### 2.1 Tách Main App và Data Vault

Hệ thống được chia thành:

- Main App → xử lý UI
- Data Vault → xử lý data

Data Vault được nhúng bằng iframe.

**Lý do:**

- Tạo boundary rõ ràng giữa UI và data layer
- Ngăn UI truy cập trực tiếp dữ liệu
- Mô phỏng kiến trúc frontend ↔ backend

---

### 2.2 Messaging bằng postMessage

Sử dụng `window.postMessage` để giao tiếp giữa 2 môi trường.

Thiết kế protocol gồm:

- Request / Response
- Correlation bằng `id`
- Action-based routing

Các action chính:

- `ping`
- `records.query`
- `records.getByIds`
- `records.bulkInsert`

**Lý do:**

- Đáp ứng constraint đề bài
- Mô phỏng API communication
- Hỗ trợ async processing

---

### 2.3 MessageBus (Main App)

Tạo abstraction `MessageBus` thay vì dùng trực tiếp `postMessage`.

Chức năng:

- Gửi request
- Mapping response theo ID
- Timeout handling
- Lắng nghe progress event

**Lý do:**

- Tách UI khỏi messaging logic
- Code sạch và dễ maintain
- Dễ mở rộng thêm event (progress)

---

### 2.4 Router trong Data Vault

`setupVaultRouter` đóng vai trò giống controller.

Chức năng:

- Nhận message
- Dispatch theo action
- Trả response

**Lý do:**

- Tổ chức code giống backend
- Dễ mở rộng thêm API

---

## 3. Data Engine Design

Data Vault được thiết kế thành 3 lớp:

### 3.1 RecordStore

- Lưu dữ liệu dạng Map<id, record>
- Truy xuất nhanh theo id

### 3.2 IndexStore

- Index theo:
  - token (search)
  - status (filter)
- Sử dụng Map<string, Set<id>>

### 3.3 QueryEngine

- Xử lý:
  - search
  - filter
  - pagination

**Lý do:**

- Tách biệt storage và query logic
- Có thể tối ưu mà không ảnh hưởng UI
- Gần với kiến trúc backend thực tế

---

## 4. Search & Query Strategy

### 4.1 Token-based search

- Split text thành token
- Match bằng index

**Ưu điểm:**

- Nhanh hơn filter array
- Scale tốt hơn

---

### 4.2 Fix bug "no match fallback"

Ban đầu:

- nếu không match → trả full dataset

Sau khi sửa:

- phân biệt:
  - empty search → trả full
  - search không match → trả rỗng

**Kết quả:**

- UX đúng hơn
- không render sai 10,000 rows

---

## 5. Pagination Strategy

### 5.1 Pagination ở Data Vault

QueryEngine xử lý:

- total count
- page
- pageSize
- slice data

**Lý do:**

- giảm payload message
- giảm DOM render

---

### 5.2 Pagination ở UI

Main App giữ:

- page
- pageSize

Trigger query khi:

- search thay đổi
- page thay đổi

---

### 5.3 Reset page khi search đổi

**Lý do:**

- tránh case page cũ không còn valid

---

## 6. Performance Optimization

### 6.1 Không trả full dataset

→ chỉ trả page hiện tại

### 6.2 Không render full list

→ giảm DOM nodes

### 6.3 Debounce search (200ms)

→ tránh spam request

---

## 7. Bulk Insert Strategy

### 7.1 Không dùng CSV/Excel làm flow chính

**Lý do:**

- đề không yêu cầu parsing file
- focus vào performance
- tránh complexity không cần thiết

---

### 7.2 Generate data trong Data Vault

Main App chỉ gửi:

{ action: "records.bulkInsert", payload: { count: 50000 } }
Lý do:

giảm message payload
tránh serialize dữ liệu lớn
đúng vai trò Data Vault

### 7.3 Chunked Processing

Insert theo chunk:

1000 records / chunk

Lý do:

tránh blocking main thread
cho phép UI cập nhật
7.4 Yield control

Sau mỗi chunk:

await new Promise(resolve => setTimeout(resolve, 0));

Lý do:

trả quyền control về event loop
giữ UI responsive
7.5 Progress Event

Data Vault gửi event:

records.bulkInsert.progress

Main App lắng nghe và update UI.

Lý do:

feedback realtime cho user
improve UX
7.6 Non-linear Progress Behavior

Progress không tăng đều vì:

chunk đầu nhanh hơn (data nhỏ)
chunk sau chậm hơn (data lớn + index + GC)
progress dựa trên số lượng, không phải thời gian

Kết luận:

chấp nhận được
phản ánh đúng workload thực 8. UI Responsiveness

Bulk insert vẫn giữ UI mượt vì:

không block thread
chunk processing
async messaging
progress update incremental 9. Trade-offs
9.1 Không dùng Web Worker
đơn giản hơn
vẫn đạt yêu cầu
có thể thêm nếu cần nâng cấp
9.2 Không dùng virtualization (hiện tại)
pagination đã đủ
tránh over-engineering
9.3 Progress không tuyến tính
chấp nhận trade-off
ưu tiên correctness và responsiveness 10. AI Usage & Critical Thinking

AI được sử dụng để:

gợi ý kiến trúc
sinh code khung
đề xuất giải pháp

Nhưng không áp dụng trực tiếp.

Ví dụ:

AI đề xuất:

filter dữ liệu trong Main App

Vấn đề:

vi phạm constraint
không scale

Quyết định:

chuyển toàn bộ logic sang Data Vault 11. Current Status

Đã hoàn thành:

Messaging system
Data Vault architecture
QueryEngine + Indexing
Search + debounce
Pagination
Bulk insert 50,000 records không lag
Progress tracking
