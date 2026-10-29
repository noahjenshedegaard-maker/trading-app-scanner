# Chart Analyzer

Upload a screenshot of a trading chart and get a **long / short** read with percentages, powered by Claude.

> This is an AI opinion based on a picture, not financial advice.

## Run it locally

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Then open http://localhost:3000.

## Deploy on Render

1. Get an API key at https://console.anthropic.com (Settings → API Keys). You pay per use, about a cent or two per chart.
2. On Render: **New → Web Service**, pick this repo.
3. Settings:
   - **Root Directory:** leave empty
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Under **Environment**, add `ANTHROPIC_API_KEY` with your key.
5. Deploy and open the URL Render gives you.

The key stays on the server. The browser never sees it.
