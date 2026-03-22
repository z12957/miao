# Feihuang Compute Asset Management 官網

此 repo 為靜態網站專案（`index.html` + `styles.css`）。

## 建議的 repo 整理策略

- **只保留一條發布主線：`main`**
- 其他需求分支（feature/fix）都先開 PR，合併後才進 `main`
- GitHub Pages 只從 GitHub Actions 產出的 artifact 發布（避免手動切 branch 造成 404）

## 專案結構

- `index.html`：網站主頁
- `styles.css`：樣式
- `.github/workflows/deploy-pages.yml`：Pages 自動部署流程

## 開發流程（建議）

```bash
# 1) 從 main 開新分支
git checkout main
git pull origin main
git checkout -b feature/your-change

# 2) 開發與提交
git add .
git commit -m "feat: your change"

# 3) 推送與開 PR
git push -u origin feature/your-change
```

## 發布流程

1. PR merge 到 `main`
2. GitHub Actions 自動執行 `Deploy static site to GitHub Pages`
3. 到 Actions 確認成功
4. 站點會更新到：<https://z12957.github.io/miao/>

## 為什麼之前會 404

使用 `Deploy from a branch` 時，如果選到沒有 `index.html` 的分支或目錄，就會出現 404。
改用 workflow artifact 發布，可避免誤選分支問題。
