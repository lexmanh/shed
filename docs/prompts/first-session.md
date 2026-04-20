Xin chào Claude. Đây là session đầu tiên của project Shed — một CLI tool 
cross-platform giúp developer dọn disk space an toàn, có tích hợp AI.

QUAN TRỌNG: Trước khi làm BẤT KỲ điều gì khác, hãy thực hiện đúng thứ tự sau:

BƯỚC 1 — Đọc context
- Đọc toàn bộ CLAUDE.md (file ở root) - chứa 6 non-negotiable safety rules
- Đọc toàn bộ PLAN.md - roadmap phases và priorities  
- Đọc README.md để hiểu positioning

BƯỚC 2 — Confirm hiểu rules
Sau khi đọc, báo cáo cho tôi:
(a) Tóm tắt 6 safety rules trong CLAUDE.md section 2 bằng 1 câu mỗi rule
(b) Current phase theo PLAN.md là gì
(c) Dependency direction giữa 4 packages (core, cli, agent, mcp-server)

BƯỚC 3 — Environment baseline
Chạy tuần tự và báo cáo output:
- `pnpm install` 
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`

BƯỚC 4 — Dừng lại chờ lệnh
Sau khi hoàn thành 3 bước trên, DỪNG. Không viết code, không tự ý implement 
gì cả. Báo cáo status và chờ tôi giao task đầu tiên từ Phase 0.

Ràng buộc tuyệt đối (áp dụng vĩnh viễn trong project này):
- Rule 1 từ CLAUDE.md: TUYỆT ĐỐI không viết code gọi fs.rm, fs.unlink, 
  hoặc rimraf bên ngoài class SafetyChecker. CI có job grep để phát hiện 
  vi phạm này.
- Mọi destructive operation phải default dry-run.
- Tests before implementation cho safety-critical code.

Nếu gặp lỗi ở bước nào, dừng và hỏi tôi thay vì tự workaround. Tôi thà 
mất 5 phút bàn bạc còn hơn Claude đoán sai và viết code trên nền tảng 
sai lệch.