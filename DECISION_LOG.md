## 1. Technical Choices

### 1.1. Lựa chọn kiến trúc: tách Main App và Data Vault bằng iframe

Tôi chủ động chia hệ thống thành 2 phần độc lập:

- **Main App**: chỉ chịu trách nhiệm hiển thị UI, nhận input người dùng và gửi request.
- **Data Vault**: chịu trách nhiệm lưu trữ dữ liệu, indexing, query processing và bulk operations.

Data Vault được nhúng qua **iframe** để tạo ra một boundary rõ ràng giữa UI layer và data layer.

**Lý do lựa chọn:**

- Bám sát constraint của đề bài: Main App không được trực tiếp sở hữu hoặc truy cập database.
- Tạo một cơ chế tách biệt ở mức runtime, thay vì chỉ tách bằng folder/module.
- Mô phỏng đúng tinh thần một hệ thống có frontend và data service giao tiếp qua một protocol riêng.

---

### 1.2. Giao tiếp bất đồng bộ bằng `postMessage`

Tôi sử dụng `window.postMessage` làm kênh giao tiếp giữa Main App và Data Vault.

Protocol được chuẩn hóa theo hướng request/response, gồm:

- `id`: correlation id để mapping request-response
- `action`: loại thao tác cần thực hiện
- `payload`: dữ liệu đầu vào
- `status`: success/error ở response

Ngoài request/response thông thường, tôi bổ sung thêm **progress event** cho các tác vụ dài như bulk insert và bulk update.

**Lý do lựa chọn:**

- Đây là cơ chế phù hợp nhất để giao tiếp giữa hai context độc lập trong browser.
- Correlation id giúp xử lý nhiều request bất đồng bộ mà không bị lẫn response.
- Progress event giúp UI phản hồi tốt hơn với các long-running jobs.

---

### 1.3. Tạo abstraction `MessageBus` thay vì gọi `postMessage` trực tiếp

Ở Main App, tôi không gọi `postMessage` trực tiếp trong component mà bọc nó trong một lớp `MessageBus`.

`MessageBus` chịu trách nhiệm:

- gửi request
- chờ response theo `id`
- timeout handling
- lắng nghe progress event

**Lý do lựa chọn:**

- Tách UI ra khỏi messaging details.
- Làm cho component React đơn giản hơn, dễ đọc hơn.
- Dễ mở rộng về sau khi có thêm action hoặc thêm loại event.

---

### 1.4. Router pattern trong Data Vault

Trong Data Vault, tôi dùng một router trung tâm để:

- nhận message
- kiểm tra origin
- validate request
- dispatch theo `action`
- trả response về Main App

Các action chính hiện tại gồm:

- `ping`
- `records.query`
- `records.getByIds`
- `records.bulkInsert`
- `records.bulkUpdateStatus`

**Lý do lựa chọn:**

- Giống mô hình controller/router ở backend.
- Dễ quản lý luồng xử lý.
- Dễ thêm validate và security guard theo từng action.

---

### 1.5. Thiết kế Data Engine gồm `RecordStore`, `IndexStore`, `QueryEngine`

Tôi không để toàn bộ logic trong một file mà tách thành 3 lớp:

#### `RecordStore`

Lưu dữ liệu gốc dưới dạng `Map<id, record>`.

**Lý do lựa chọn:**

- Truy xuất theo id nhanh.
- Dễ update/upsert.
- Phù hợp với các thao tác getById/getByIds.

#### `IndexStore`

Lưu các index phụ:

- `byToken`: phục vụ search
- `byStatus`: phục vụ filter

Dữ liệu index được tổ chức theo dạng `Map<string, Set<id>>`.

**Lý do lựa chọn:**

- Lookup nhanh.
- Dễ intersect với nhau.
- Dễ maintain khi insert/update.

#### `QueryEngine`

Xử lý:

- search
- filter
- pagination

**Lý do lựa chọn:**

- Tách hẳn query logic khỏi store và router.
- Dễ tối ưu thuật toán mà không ảnh hưởng UI.
- Giúp kiến trúc rõ ràng hơn: storage, index, query là ba concern khác nhau.

---

### 1.6. Search Algorithm

Search hiện tại được xây theo hướng:

Search được triển khai bằng một inverted index sử dụng HashMap (`Map<string, Set<id>>`).

Thay vì mỗi lần search phải duyệt toàn bộ dataset, hệ thống sẽ chuẩn bị trước một cấu trúc index, trong đó mỗi token (từ được tách ra từ name và email) sẽ được ánh xạ tới tập các record id chứa token đó.

Ví dụ:

- "user" → {1, 2, 3}
- "1" → {1, 4, 5}

Khi người dùng nhập từ khóa như "user 1", hệ thống sẽ:

1. Tách input thành các token: ["user", "1"]
2. Tra cứu từng token trong Map (O(1))
3. Lấy giao (intersection) giữa các tập id
4. Trả về danh sách record tương ứng

**Lý do lựa chọn:**

- Tránh việc filter tuyến tính trên toàn bộ array mỗi lần user search.
- Lookup qua `Map` và `Set` nhanh hơn đáng kể.
- Dễ kết hợp nhiều điều kiện query.

Đây là một trade-off có chủ đích: chọn **exact token search** để ưu tiên performance và scalability.
Điểm yếu của cái này là không thể tìm kiếm nếu chỉ xuất hiện những từ khóa gần đúng ( "u" , "us" , "use" , ...)

---

### 1.7. Pagination được xử lý trong Data Vault, không phải ở UI

Pagination được thực hiện trong `QueryEngine` thay vì để Main App nhận toàn bộ kết quả rồi tự cắt.

**Lý do lựa chọn:**

- Giảm payload đi qua `postMessage`.
- Giảm số lượng record mà UI phải render.
- Gần với cách một backend API hoạt động thực tế.

---

### 1.8. Bulk Insert được thiết kế như long-running job trong Data Vault

Tôi không gửi 50,000 records từ Main App sang Data Vault, mà chỉ gửi yêu cầu:

- loại thao tác
- số lượng record cần insert

Data Vault tự generate dữ liệu và insert theo chunk.

**Lý do lựa chọn:**

- Tránh truyền payload quá lớn qua `postMessage`.
- Đúng vai trò của Data Vault là data engine.
- Giảm overhead serialization/cloning giữa hai context.

---

### 1.9. Các công nghệ và lựa chọn triển khai

- **React + TypeScript + Vite** cho Main App
- **TypeScript** cho Data Vault
- `Map` / `Set` cho in-memory store và index
- `performance.now()` để đo timing
- `setTimeout(0)` để cooperative yielding trong bulk jobs

**Lý do lựa chọn:**

- React giúp dựng UI nhanh và rõ ràng.
- TypeScript giúp kiểm soát protocol và state tốt hơn.
- `Map` / `Set` phù hợp với use case lookup/intersection.
- `performance.now()` phù hợp cho benchmark chi tiết ở mức milliseconds.
- `setTimeout(0)` là cách đủ đơn giản và hiệu quả để tránh block event loop .

---

## 2. Optimization

### 2.1. Vấn đề đầu tiên: query trả quá nhiều dữ liệu, UI render quá nặng

Ở giai đoạn đầu, khi query trả nhiều record cùng lúc, Main App có thể phải render số lượng lớn item, gây cảm giác lag.

**Cách khắc phục:**

- Đưa pagination vào `QueryEngine`.
- Chỉ trả đúng page hiện tại thay vì full result set.
- Giữ `total` tách riêng khỏi `items`.

**Kết quả:**

- Giảm payload truyền qua `postMessage`.
- Giảm số lượng DOM nodes phải render.
- UI mượt hơn rõ rệt.

---

### 2.2. Vấn đề thứ hai: search không match nhưng lại fallback về full dataset

Một lỗi logic ban đầu là:

- khi user nhập từ khóa không match token nào,
- hệ thống lại coi như “không có search”
- và trả full dataset.

Điều này vừa sai về mặt UX, vừa làm UI render nhiều dữ liệu không cần thiết.

**Cách khắc phục:**

- Phân biệt rõ hai case:
  - không nhập gì
  - có nhập nhưng không match
- Nếu token không tồn tại trong index thì trả kết quả rỗng ngay.

**Kết quả:**

- Không còn hiện tượng gõ linh tinh mà vẫn ra toàn bộ dữ liệu.
- UX đúng hơn.
- Tránh render 10,000+ rows không cần thiết.

---

### 2.3. Vấn đề thứ ba: search bị spam request khi user gõ nhanh

Nếu mỗi ký tự đều trigger query ngay, số lượng request sẽ tăng cao và tạo áp lực không cần thiết lên UI và Data Vault.

**Cách khắc phục:**

- Dùng debounce 200ms ở Main App.
- Chỉ gửi query khi user dừng gõ một khoảng ngắn.

**Kết quả:**

- Giảm số lượng request đáng kể.
- Trải nghiệm search realtime mượt hơn.
- Giữ được responsiveness mà không phải query quá nhiều.

---

### 2.4. Vấn đề thứ tư: Search Performance

Ban đầu, cách đơn giản nhất để search là dùng `.filter()` trên toàn bộ dataset
Cách này có độ phức tạp O(n), vì mỗi lần search đều phải duyệt toàn bộ dữ liệu.
Nhưng như vậy thì nếu list record nhiều lên thì sẽ gây lag

**Cách khắc phục:**

Để tối ưu, tôi xây dựng một inverted index bằng HashMap, trong đó mỗi token được ánh xạ tới tập các record id chứa token đó. Khi search, hệ thống chỉ cần:

- tra cứu token trong Map (gần O(1))
- intersect các tập kết quả nhỏ

**Kết quả:**

- Search/filter nhanh hơn đáng kể.
- Query complexity thấp hơn so với linear filtering.
- Kiến trúc sẵn sàng scale tốt hơn khi dataset lớn dần.
  Ngoài ra, hệ thống cũng xử lý riêng trường hợp không tìm thấy token trong index, tránh việc fallback về toàn bộ dataset, giúp giảm tải cho UI và đảm bảo kết quả chính xác hơn.

---

### 2.5. Vấn đề thứ năm: bulk insert 50,000 records có nguy cơ làm freeze UI

Nếu insert hàng loạt trong một vòng loop lớn liên tục, browser có thể bị block main thread của iframe, kéo theo progress update không mượt và cảm giác ứng dụng bị đơ.

**Cách khắc phục:**

- Chia thao tác insert thành từng chunk.
- Sau mỗi chunk, `await setTimeout(0)` để yield control về event loop.
- Emit progress event cho Main App.

**Kết quả:**

- Bulk insert vẫn hoàn tất mà không làm UI freeze.
- Người dùng nhìn thấy tiến trình xử lý.
- Bài toán load test được giải quyết đúng tinh thần đề bài.

---

### 2.6. Vấn đề thứ sáu: bulk update chậm hơn insert và dễ timeout

Bulk update nặng hơn insert vì nó không chỉ add dữ liệu mới, mà còn phải:

- đọc record cũ
- remove khỏi index cũ
- update store
- add lại vào index mới

Ở phiên bản đầu, bulk update còn overwrite toàn bộ dataset kể cả các record đã đúng trạng thái.

**Cách khắc phục:**

- Áp dụng chunking tương tự bulk insert.
- Chỉ update các record thực sự cần đổi status.
- Tăng timeout riêng cho bulk update.
- Không cho chạy đồng thời nhiều bulk jobs.

**Kết quả:**

- Giảm đáng kể số mutation không cần thiết.
- Progress hợp lý hơn.
- Giảm nguy cơ timeout.
- Giữ index consistency tốt hơn.

---

### 2.7. Vấn đề thứ bảy: progress ban đầu chưa phản ánh đúng lượng công việc thực tế

Ở bulk update, progress từng được tính theo tổng số record đã duyệt trong toàn dataset, không phải số record thực sự cần update. Điều này làm progress bar trông không đúng bản chất của job.

**Cách khắc phục:**

- Tính trước `targetIds` là tập các record thực sự cần update.
- Chạy chunk trên `targetIds`.
- Tính progress theo `targetIds.length`.

**Kết quả:**

- Progress chính xác hơn.
- Thời gian xử lý giảm vì không cần loop lại toàn bộ dataset.
- Logic job rõ ràng hơn.

---

### 2.8. Vấn đề thứ tám: race condition khi Main App chạy trước Data Vault

Trong một số lần khởi động, Main App có thể gửi request quá sớm khi Data Vault chưa sẵn sàng, dẫn đến mất message hoặc query fail ngay từ đầu.

**Cách khắc phục:**

- Thêm ready handshake (`vault.ready`).
- Main App chỉ bắt đầu query khi Data Vault đã signal sẵn sàng.

**Kết quả:**

- Startup ổn định hơn.
- Tránh request bị drop do `postMessage` không có cơ chế queue/retry mặc định.

---

### 2.9. Vấn đề thứ chín: bulk jobs có thể xung đột nếu chạy đồng thời

Nếu cho bulk insert và bulk update chạy cùng lúc, có thể xảy ra:

- race condition
- dữ liệu/index không nhất quán
- progress chồng chéo
- timeout hoặc UX khó hiểu

**Cách khắc phục:**

- Chỉ cho phép một bulk job chạy tại một thời điểm.
- Disable bulk actions ở UI khi đang có bulk job.
- Xem bulk jobs như mutually exclusive long-running tasks.

**Kết quả:**

- Hệ thống ổn định hơn.
- Dễ reasoning hơn.
- Tránh trạng thái dữ liệu khó kiểm soát.

---

### 2.10. Vấn đề thứ mười: khó đánh giá chính xác search đang nhanh đến mức nào

Vì hệ thống dùng `postMessage` chứ không dùng HTTP, nên không thể dựa vào Network tab để biết query mất bao lâu.

**Cách khắc phục:**

- Đo `Query Engine Time` bên trong Data Vault bằng `performance.now()`.
- Đo `Round-trip Time` ở Main App.
- Bổ sung thêm `Hydrate Time` và `Vault Processing Time`.

**Kết quả:**

- Có thể phân biệt rõ:
  - thuật toán query nhanh cỡ nào
  - Data Vault xử lý tổng thể mất bao lâu
  - user thực sự chờ trong bao lâu
- Giúp việc tối ưu và demo có cơ sở định lượng hơn.

---

### 2.11. Tư duy tối ưu tổng thể

Các tối ưu tôi áp dụng không tập trung vào một điểm duy nhất, mà trải trên toàn bộ pipeline:

- giảm chi phí query bằng indexing
- giảm chi phí transfer bằng pagination
- giảm chi phí render bằng giới hạn số item trả về
- giảm blocking bằng chunking + yielding
- giảm mutation không cần thiết bằng conditional bulk update

Điểm quan trọng nhất là:
**tối ưu không chỉ nằm ở thuật toán search**, mà nằm ở toàn bộ chuỗi từ request, processing, transfer, render đến long-running job handling.

## 3.AI Usage & Critical Thinking:

### 3.1. Các phần đã nhờ sự giúp đỡ của AI :

- Technical choices: Nhờ ai giải thích khái niệm (data vault , iframe ,... ) , cách triển khai hệ thống
- Sercurity : Nhờ ai thiết kế luồng dữ liệu đảm bảo an toàn thông tin
- Architecture: tham khảo thiết kế một giao thức giao tiếp không đồng bộ (Asynchronous Messaging Protocol) đảm bảo tính toàn vẹn, bảo mật và đúng thứ tự của luồng dữ liệu cần những gì, mini MVP để có thể tương tác giữa 2 project ( ping action),
- Optimization : Dựa trên hashmap để xây dựng thuật toán tìm kiếm tối ưu hơn cho 1 list record lớn với độ phức tạp nhỏ, tham khảo cách chunk dữ liệu ở bulk action để không bị overload

### 3.2.Trường hợp AI đưa ra giải pháp sai hoặc chưa tối ưu cho bài toán

- Ở phần bulk update ( update status thành 1 giá trị xác định ( active , inactive) ) thì Ai đã update toàn bộ list record ,
  điều này sẽ không gây ảnh hưởng gì nhiều nếu số lượng record đang ít , nhưng sau khi chúng ta có số lượng record lớn hơn
  ( Có thể thông qua bulk insert ) thì việc chúng ta update toàn bộ record ( kể cả những cái vốn đã là status đó rồi) trở nên
  không cần thiết và gây lãng phí tài nguyên , vì cho dù chỉ có 1 cái record cần đổi trạng thái , thì vẫn sẽ loop toàn bộ record ->
  Tiến độ chậm hơn rất nhiều , timeout request ,

**Cách khắc phục:** Tôi sẽ chỉ udpate cho những record có status đối nghịch thôi , như vậy sẽ tối ưu tài nguyên hơn và progress sẽ nhanh hơn đáng kể

- cho phép bulk insert và bulk update cùng lúc gây nhiễu UI -> Có thể dẫn đến sai sót
  => Chỉ cho phép dùng 1 loại bulk action trong cùng 1 thời điểm
