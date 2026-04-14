# DECISION LOG

## 1. Định nghĩa bài toán (Problem Framing)

Mục tiêu của bài toán là xây dựng một hệ thống quản lý dữ liệu hiệu suất cao, trong đó tách biệt hoàn toàn giữa:

- Main App (UI Layer)
- Data Vault (Data Processing Layer)

Ràng buộc quan trọng nhất:
Main App không được phép truy cập trực tiếp hoặc sở hữu dữ liệu.

Mọi thao tác (CRUD, search, filter) phải thông qua cơ chế messaging bất đồng bộ giữa hai môi trường.

Điều này khiến hệ thống trở thành một dạng “mini distributed system” chạy hoàn toàn trong trình duyệt.

---

## 2. Technical Choices (Lựa chọn kỹ thuật)

### 2.1 Tách Main App và Data Vault bằng iframe

Hệ thống được chia thành 2 ứng dụng độc lập:

- Main App: xử lý giao diện và tương tác người dùng
- Data Vault: xử lý lưu trữ và truy vấn dữ liệu

Data Vault được nhúng qua iframe để đảm bảo tính cách ly.

**Lý do lựa chọn:**

- Ép buộc boundary giữa UI và data layer
- Tránh việc UI truy cập trực tiếp vào dữ liệu
- Mô phỏng kiến trúc frontend ↔ backend ngoài đời thực

---

### 2.2 Giao tiếp bằng postMessage (Asynchronous Messaging)

Sử dụng `window.postMessage` để giao tiếp giữa hai môi trường.

Xây dựng một protocol gồm:

- Request / Response
- ID để mapping request-response
- Action-based routing

Ví dụ các action:

- "ping"
- "records.query"
- "records.getByIds"

**Lý do lựa chọn:**

- Đáp ứng đúng constraint của đề bài
- Mô phỏng giao tiếp API
- Hỗ trợ bất đồng bộ và nhiều request đồng thời

---

### 2.3 MessageBus (Main App)

Thay vì gọi `postMessage` trực tiếp, xây dựng abstraction `MessageBus`.

Chức năng:

- Gửi request
- Mapping response theo ID
- Xử lý timeout và error

**Lý do lựa chọn:**

- Tách UI khỏi logic messaging
- Tăng khả năng maintain
- Dễ mở rộng về sau

---

### 2.4 Router trong Data Vault

Xây dựng `setupVaultRouter` đóng vai trò giống controller.

Chức năng:

- Nhận message
- Phân luồng theo action
- Trả response

**Lý do lựa chọn:**

- Giống pattern backend controller
- Tách logic rõ ràng
- Dễ scale khi thêm feature

---

### 2.5 Thiết kế Data Engine

Data Vault được tổ chức thành:

- RecordStore → lưu data gốc (Map<id, record>)
- IndexStore → lưu index để search nhanh
- QueryEngine → xử lý logic query

**Lý do lựa chọn:**

- Tách storage và processing
- Cho phép tối ưu mà không ảnh hưởng UI
- Gần với kiến trúc backend thực tế

---

### 2.6 Dữ liệu giả lập (Mock Data)

Sinh ~10,000 records ban đầu.

**Lý do lựa chọn:**

- Test được performance cơ bản
- Không phụ thuộc backend
- Dễ debug

---

## 3. Optimization (Tối ưu - Giai đoạn đầu)

Hiện tại chưa tối ưu sâu, nhưng kiến trúc đã chuẩn bị sẵn:

- Sử dụng index thay vì filter array
- Đẩy toàn bộ query vào Data Vault
- Không để UI xử lý dữ liệu lớn

Những quyết định này giúp:

- scale lên 500k records dễ hơn
- tránh bottleneck ở UI

---

## 4. AI Usage & Critical Thinking

AI được sử dụng để:

- Gợi ý kiến trúc iframe-based
- Sinh code khung ban đầu
- Đề xuất hướng indexing

Tuy nhiên, không áp dụng mù quáng.

### Ví dụ cụ thể:

AI ban đầu đề xuất:
→ filter trực tiếp trong Main App bằng array methods

**Vấn đề:**

- Vi phạm constraint (UI không được access data)
- Không scale khi data lớn

**Quyết định:**

- Chuyển toàn bộ logic sang Data Vault
- Xây QueryEngine + IndexStore

**Kết quả:**

- Kiến trúc đúng yêu cầu
- Chuẩn bị tốt cho performance optimization

---

## 5. Trạng thái hiện tại

Hệ thống đã đạt được:

- Giao tiếp Main App ↔ Data Vault qua iframe
- Messaging protocol có request/response
- MessageBus xử lý async communication
- Router xử lý action trong Data Vault
- QueryEngine xử lý query cơ bản
- Render dữ liệu từ Data Vault lên UI

---

## 6. Hướng phát triển tiếp theo

- Search realtime + debounce
- Indexing nâng cao
- Bulk insert 50,000 records không lag
- Virtualized list (tối ưu render)
- Đo thời gian query (benchmark)

## Phase 3 - Pagination and No-Match Handling

### Problem

Even after moving query logic into the Data Vault, the UI could still lag when too many rows were returned and rendered. Another issue was that invalid search terms incorrectly fell back to rendering the full dataset.

### Solution

- Added pagination at the query level
- Returned only the current page of matched records
- Distinguished between:
  - empty search
  - search with no matching results

### Result

- Reduced message payload size
- Reduced DOM rendering cost
- Prevented incorrect fallback to 10,000 rows when search terms did not match any data
