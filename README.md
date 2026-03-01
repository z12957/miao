# Vast.ai 監控網頁

這個專案提供一個可直接開啟的前端網頁，用來監控 Vast.ai 租金與租用率，並在租金變化超過門檻時用 Telegram 通知。

## 功能

- 從來源 Grafana dashboard 讀取 `gpu_name` 變數清單。
- GPU 搜尋列僅作為篩選顯示，**不能手動新增不存在的型號**。
- 依你選取的 GPU 逐一查詢租金、租用率。
- 租金變動超過門檻（%）時自動發送 Telegram 訊息。

## 使用

1. 開啟 `index.html`。
2. 點「載入來源設定與 GPU 清單」。
3. 搜尋與勾選要監控的 GPU。
4. 設定刷新秒數、通知門檻、verified、fee multiplier。
5. 填入 Telegram bot token/chat id（可選）。
6. 按「開始監控」。

## 注意

- 若目標 Grafana 對跨網域有限制，瀏覽器可能因 CORS 無法直接抓資料。
- 若你的環境遇到 CORS，請將網頁放在同網域，或使用反向代理。
