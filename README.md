# 房產投資評估 LINE Bot

這是一套以 LINE 對話流程為核心的房產投資評估工具，專門用來判斷投資戶合理取得價、投資硬上限、車位拆算、租金投報、貸款現金流與房地合一稅風險。

## 核心功能

- LINE 對話指令：`新增物件`、`修正：...`、`重新試算`、`產出報告`
- 車位拆算與單價口徑檢查
- 租金投報率試算
- 貸款月還款與租後自補
- 預售實登日與成屋登記日防呆
- 屋主房地合一稅與稅後實拿
- JSON 檔案保存案件資料
- Render 一鍵部署準備

## 本機啟動

```bash
npm install --no-audit --no-fund --package-lock=false
npm run dev
```

健康檢查：

```bash
curl http://localhost:3000/health
```

## 本機測試 LINE 對話流程

```bash
curl -X POST http://localhost:3000/api/message/test \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test_user","text":"新增物件"}'
```

```bash
curl -X POST http://localhost:3000/api/message/test \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test_user","text":"建案：W站前\n開價：1475萬\n房型：1+1房車\n權狀坪數：27.6坪\n主建物坪數：19.6坪\n車位：坡道平面\n月租金：22000\n前手取得價：922萬"}'
```

```bash
curl -X POST http://localhost:3000/api/message/test \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test_user","text":"修正：\n成交價：1150萬\n車位坪數：8坪\n車位價格：180萬\n月租金：22000\n貸款成數：60%\n利率：2.65%\n貸款年期：30年\n成屋登記日：2026/04/01\n賣方服務費：2%\n買方服務費：1%"}'
```

```bash
curl -X POST http://localhost:3000/api/message/test \
  -H 'Content-Type: application/json' \
  -d '{"userId":"test_user","text":"重新試算"}'
```

## Render 部署

Build Command:

```bash
npm install --no-audit --no-fund --package-lock=false
```

Start Command:

```bash
npm start
```

環境變數：

```env
NODE_ENV=production
PORT=10000
DATA_DIR=./data
PUBLIC_BASE_URL=https://你的-render-網址
LINE_CHANNEL_ACCESS_TOKEN=你的_LINE_TOKEN
LINE_CHANNEL_SECRET=你的_LINE_SECRET
```

LINE Webhook URL：

```text
https://你的-render-網址/api/line/webhook
```

## 注意

目前圖片 OCR 尚未接入，第一階段先支援文字資料與截圖文字貼上。正式多人使用時，案件保存建議升級為 Supabase / PostgreSQL。
