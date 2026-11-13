# CHEN. Portfolio — 自動驗收報告（第 15–18 階段）

日期：2026-11-13（台灣時間）
分支：`feature/zero-cost-private-media`
**正式啟用：未進行。Cloudflare 版本切換及真實資料遷移尚未通過驗收。**

## 第 15 階段｜自動化整合與權限驗收
**隔離測試通過。**
- Worker 語法與全部既有回歸測試成功。
- 私有媒體、登入權限、CSRF、Origin、草稿版本保留、衝突比對、合併另存新版本均由隔離測試涵蓋。
- `backend/phase15-acceptance.test.mjs` 驗證發布、私人媒體與合併寫入開關仍保持關閉。
- 原始兩張照片及其引用通過唯讀檢查。
- 證據：https://github.com/chenofficial0/portfolio/actions/runs/43386980851

## 第 16 階段｜桌面與手機瀏覽器驗收
**合成資料 Chromium 自動測試通過，未達真人內容驗收。**
- 使用瀏覽器自動化操作版本清單、兩份衍生版本選擇、衝突欄位、合併預覽與排版檢查。
- 額外測試授權時的另存確認按鈕與未授權時的唯讀隱藏行為；未連接正式後台。
- 首次測試曾因最新 Ubuntu Runner 不支援該版本 Chromium 安裝而失敗，已將測試 Runner 固定至 Ubuntu 24.04，重新執行通過。
- 證據：https://github.com/chenofficial0/portfolio/actions/runs/43387503906

## 第 17 階段｜資料遷移與還原演練
**模擬儲存空間演練通過；真實 Cloudflare 資料遷移未開始。**
- `backend/phase17-migration-dry-run.test.mjs` 將目前草稿匯入模擬私人版本儲存、讀回比對，確認兩張照片引用未變。
- 追加新的模擬版本後，原始版本與來源 JSON 仍保持不變。
- 模擬寫入失敗時拒絕繼續；還原演練透過選擇原始不可覆寫版本完成。
- 無真實 Cloudflare KV 綁定、跨區一致性或私有媒體讀取驗證，不可視為遷移驗收完成。
- 證據：https://github.com/chenofficial0/portfolio/actions/runs/43387673937

## 第 18 階段｜正式環境唯讀健康檢查
**唯讀基線通過；正式部署與發布驗收尚未執行。**
- GitHub Pages 首頁回應正常，公開內容 JSON 結構正常。
- Cloudflare Worker 未登入工作階段 API 回應正確，未登入讀取草稿遭拒。
- 在既有正式網站中沒有新增任何資料、刪除照片、更新 Worker 或切換發布開關。
- 證據：https://github.com/chenofficial0/portfolio/actions/runs/43387851548

## 阻擋正式啟用的事項
1. 尚無可供目前連線操作的 Cloudflare 帳號管理能力，未建立/綁定並驗證真正的私人草稿 KV 儲存空間。
2. Workers KV 是最終一致性儲存；並行寫入及重試收據無原子交易保證。正式啟用前應限制操作流程，或採用可驗證的單一寫入機制。
3. 現有圖片仍位於公開 GitHub Pages 路徑；私有媒體遷移、公開資料清理及 Git 歷史殘留評估未完成。
4. 未在完整登入的正式或受控測試環境進行端到端資料上傳、正式預覽、回復及發布演練。
5. 新版頁面尚未合併或部署。需最後使用者對公開展示結果的確認。

## 安全界線
目前只持續在獨立分支自動執行測試。**不得將隔離測試通過等同於已批准部署。**
