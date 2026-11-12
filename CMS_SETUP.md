# CHEN. 網站內容管理後台

## 已完成
- 公開網站：`https://chenofficial0.github.io/portfolio/`
- 後台入口：`https://chenofficial0.github.io/portfolio/admin/`
- 內容資料：`content/site.json`
- Decap CMS 設定：`admin/config.yml`
- 資料欄位：首頁形象照、ABOUT 三語介紹、PROFILE 照片與 PDF、作品、相簿、工作信箱、社群連結
- 前台透過 `fetch('content/site.json')` 讀取公開內容，不用編輯 HTML 才能更改資料

## 還沒完成：正式管理員登入
GitHub Pages 只託管靜態檔案。Decap CMS 的 GitHub backend 要能登入，仍需 OAuth 驗證服務。請不要將 GitHub OAuth client secret、PAT 或密碼放進 Repository。

### 建議：Decap Turbo（適合個人網站）
1. 閱讀 https://decapcms.org/docs/turbo-getting-started/
2. 註冊 Decap Turbo 並建立組織
3. 連接 GitHub，僅授權 `chenofficial0/portfolio` 這個 Repo
4. 在 Turbo 新增一個網站：
   - Repository：`chenofficial0/portfolio`
   - Branch：`main`
   - Config path：`admin/config.yml`
   - Admin URL：`https://chenofficial0.github.io/portfolio/admin/`
5. 複製 Turbo 網站的 `Site ID`（不是密碼，也不是 OAuth secret）
6. 將 `admin/config.yml` 的 backend 區塊改成：
   ```yaml
   backend:
     name: turbo-github
     turbo_site_id: 你的實際 Site ID
     branch: main
   ```
7. 等 Pages 部署後，到 `/admin/` 登入，修改內容並儲存。
8. 重新整理公開網站確認內容顯示。

Decap Turbo 的免費方案是否適用，請以官方最新方案為準。若不想用 Turbo，也可自行配置 GitHub OAuth + Cloudflare Worker，但設定較複雜。

## 上傳照片、PDF
後台 Media Library 會將資料放入 `assets/uploads`。設定 `public_folder: /portfolio/assets/uploads` 是為目前的 GitHub Pages 專案子路徑而設；日後啟用 `chenofficial.com` 根網域時，需要一併調整路徑和已儲存的檔案連結。

## 注意事項
- 沒有授權的照片或影片不要上傳。
- 工作信箱、照片、公開 PDF 都是公開內容，不要放私人資料。
- 新增作品時可選擇是否公開，最新年份會排在前面。
- 內容更改會修改 GitHub 上的 `content/site.json`，GitHub Pages 會再部署。
