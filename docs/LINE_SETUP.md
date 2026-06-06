# LINE 官方帳號串接設定

## 1. 部署到 Render

建立 Render Web Service，連結本 GitHub repo。

設定：

```text
Build Command: npm install --no-audit --no-fund --package-lock=false
Start Command: npm start
```

環境變數：

```env
NODE_ENV=production
PORT=10000
DATA_DIR=./data
PUBLIC_BASE_URL=https://你的-render-網址
```

部署完成後先測：

```text
https://你的-render-網址/health
```

## 2. 建立 LINE Messaging API Channel

到 LINE Developers 建立 Provider 與 Messaging API Channel。

需要取得：

```env
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

把這兩個值加到 Render Environment Variables。

## 3. 設定 Webhook URL

```text
https://你的-render-網址/api/line/webhook
```

在 LINE Developers 後台啟用：

- Use webhook: Enabled
- Auto-reply messages: Disabled
- Greeting messages: 可先 Disabled

## 4. 測試指令

在 LINE 官方帳號輸入：

```text
新增物件
```

接著貼：

```text
建案：W站前
開價：1475萬
房型：1+1房車
權狀坪數：27.6坪
主建物坪數：19.6坪
車位：坡道平面
月租金：22000
前手取得價：922萬
```

再貼：

```text
修正：
成交價：1150萬
車位坪數：8坪
車位價格：180萬
月租金：22000
貸款成數：60%
利率：2.65%
貸款年期：30年
成屋登記日：2026/04/01
賣方服務費：2%
買方服務費：1%
```

最後輸入：

```text
重新試算
```

或：

```text
產出報告
```
