# VB Commodities Backend

This backend powers the VB Commodities paper trading engine with live Socket.IO streaming, simulated candle data, and demo trade execution.

## Features
- Live market simulation for gold, silver, platinum, copper
- WebSocket events for `market:update`, `candle:update`, `trade:open`, `trade:close`, `wallet:update`, `pnl:update`
- 1-minute auto-close paper trading
- Demo wallet with `₹100,000`
- JWT-based demo login
- Prisma schema for PostgreSQL data modeling

## Run locally

1. Copy `.env.example` to `.env`.
2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Start the backend:
   ```bash
   npm run dev
   ```

## Docker

```bash
docker compose up --build
```

## Notes

The current backend is built to be run alongside the frontend on `http://localhost:5173` by default.
