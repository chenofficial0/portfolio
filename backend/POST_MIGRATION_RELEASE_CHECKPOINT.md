# CHEN. Portfolio｜2026-11-13 遷移後正式啟用檢查點

**正式網站狀態：尚未切換新版後台；既有網站與 GitHub main 未修改。**

## 真實 Cloudflare KV 遷移
- 受控遷移 GitHub Actions：https://github.com/chenofficial0/portfolio/actions/runs/43400013375 — **成功**。
- 私人照片 2 張：首頁照片 96,820 bytes、檔案照 313,809 bytes；Cloudflare 寫入後逐筆讀回驗證雜湊及媒體中繼資料。
- 不可覆寫根草稿版本：`DHHWj72Rf_MotkHDt7jdKSAEyhwIeUDO`，獨立寫入與讀回驗證成功。
- 再次使用唯讀 Token 的完整性核對：https://github.com/chenofficial0/portfolio/actions/runs/43400277647 — **成功**，KV 內確定為 3 筆預期資料，影像 hash、metadata、草稿及私人媒體參照相符。
- 原先 GitHub 測試分支原始圖檔未移動或刪除；**公開 Git 儲存庫與歷史殘留仍須獨立處理**，此時不得宣稱這兩張照片已自公開空間撤除。

## 新版 Content Studio 與預覽
- 在開發分支新增已登入才能進入的 `/studio/private`；以人工選擇的私人草稿版本作為來源，另存時只建立新版本，不呼叫舊版 GitHub PUT。
- 私人媒體 URL 透過已登入的 `/api/media/preview` 讀取；新增指定版本的 `/preview/private?revision=<id>` 與 `/api/preview/private-content?revision=<id>`。
- 舊 GitHub 草稿的 GET/PUT 及舊發布 API 在不可覆寫私人模式下全部拒絕；不可只依賴隱藏按鈕。
- 桌面、手機 Chromium 操作、Worker API 隔離安全測試、正式網站唯讀健康檢查及 Wrangler 打包測試均通過。
- 最新成功的 4 組自動化回歸：https://github.com/chenofficial0/portfolio/actions/runs/43401415711 和 https://github.com/chenofficial0/portfolio/actions/runs/43401318858 。

## 既有 Worker 更新之前
- `backend/wrangler.toml` 設定 `keep_vars=true` 保護 Dashboard 現存變數；既有 Secrets 仍由 Cloudflare 管理。
- 特定功能 `ENABLE_PRIVATE_STUDIO`, `ENABLE_IMMUTABLE_DRAFTS`, `ENABLE_REVISION_COMPARISON`, `ENABLE_LIVE_PUBLISH` 等仍為 **false**。
- 已建立 `.github/workflows/worker-inactive-version-upload.yml`，需要特定觸發檔及 `CLOUDFLARE_WORKER_EDITOR_TOKEN`，只執行 `wrangler versions upload` **不會部署新版本或改變正式流量**。
- **尚未執行 version upload；缺少 Cloudflare Editor 權限**。建議只核發針對 `chen-content-studio-api` 的 7 日期限 Worker Editor API token，直接保存在 GitHub Actions Secrets，勿傳給助理。

## 正式啟用尚需完成
1. 非啟用版 Worker 上傳，安全檢查其功能開關與登入阻擋（不改 production）。
2. 正式部署前版本/設定回復方案，實際登入後的私人照片與草稿端到端測試。
3. 媒體上傳、照片在網站呈現及正式發布路徑專門驗收；評估公開 Git 歷史清理與可復原性。
4. 使用者最後確認對外呈現內容後，才發布網站與宣布正式啟用。

**禁止將 KV 遷移成功、隔離測試通過誤寫為已正式啟用。**

## 2026-11-13 Worker inactive-version verification — VERIFIED

- Owner configured `CLOUDFLARE_WORKER_EDITOR_TOKEN` as an account secret scoped to individual Worker `chen-content-studio-api`.
- Initial `wrangler versions upload` reported successful upload, then exited with auth error 10000 when querying the account-level Workers subdomain endpoint. The command was **not re-run**.
- Cloudflare official versions/deployments APIs read-only verification confirms uploaded **v84** ID `d27643da-8044-4861-b8c6-e55e14a6b28e`, while active production remains **v83** ID `da3650c4-7785-4e81-b5d6-71cb817e2da1` receiving **100% of traffic**.
- Versions/deployments API result shape correction was made from `result.versions` to `result.items`, documented by Cloudflare API. Successful audit: https://github.com/chenofficial0/portfolio/actions/runs/43404382298 .
- Further audited v84 `GET /versions/{id}` and current deployment using the existing scoped token: all private, publishing, draft and media features flagged off, both KV bindings match their original namespaces, and both existing GitHub OAuth/session encryption secret **binding names** are present. No secret values logged. Success: https://github.com/chenofficial0/portfolio/actions/runs/43404757950 .
- New inactive-version audit remains read-only. **No production deployment or traffic switch occurred.**
- Remaining mandatory release blocker: version-pinned private drafts must have a tested, explicit publishing flow with safe handling of private media before the new editor can become the production workflow. Currently immutable draft mode intentionally refuses legacy publish endpoints. Must additionally audit public photo exposure and Git history, live authenticated preview, login/rollback before production enablement.
- **Do not blindly grant broader Cloudflare permissions or repeat Worker version upload.** Existing v84 is verified and ready for further controlled acceptance.

## 2026-11-13 — Immutable private publication disclosure preflight

- Added `backend/src/private-revision-publish-plan.js`: pure function (no writes) for a selected immutable draft. It detects changed site sections, translates private KV media paths to their *proposed public paths*, lists every unique private media item, SHA-256 hashes source and proposed published content, marks explicit public-disclosure approval as mandatory, and fails closed if private references remain in unreviewed fields.
- The real migrated two-photo snapshot has a golden test: build private migration bundle from existing images and `content/site.json`, then plan publication. The proposed public document must reproduce the original snapshot exactly. The test does **not** publish either photograph or draft.
- Added authenticated `GET /api/publish/private-plan?revision=<id>`, behind new independent `ENABLE_PRIVATE_PUBLISH_PLANS=false` plus immutable/private Studio feature gates. Endpoint never writes, never generates an actionable publication approval, and strips entire proposed public content from the summary response.
- Verified a temporary CI failure from the stricter path allowlist (stale `MEDIA_FIELDS` reference), fixed it before acceptance; final GitHub Actions run https://github.com/chenofficial0/portfolio/actions/runs/43406116290 succeeded with **all four jobs**: isolated regression, desktop/mobile Chromium, Worker bundle dry-run and live public read-only smoke.
- **Release blocker remains:** the current publish endpoints deliberately reject immutable drafts, and there is no implemented/reviewed authenticated *private revision → public GitHub commit* transaction, media-copy consistency strategy, revision-main head reconciliation, explicit publish confirmation, or validated rollback. The new plan is a disclosure preview only, **not** permission to launch.
- Current production continues on v83. The inactive v84 is not updated by these branch-only changes. No Worker deploy or main-branch edits occurred.
