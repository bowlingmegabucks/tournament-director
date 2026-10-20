# api

Express 5 + TypeScript. Node 24 (`.nvmrc`). Standards: [docs/api-standards.md](../docs/api-standards.md).

```
npm ci
cp .env.example .env
npm run dev          # http://localhost:3000, restarts on change (or `npm run dev` at the repo root for web + api)
curl localhost:3000/tournaments
```

| Route              | Returns                                                 |
| ------------------ | ------------------------------------------------------- |
| `GET /health`      | `{ "status": "ok" }`                                    |
| `GET /tournaments` | `Tournament[]`: 3 to 7 random ones per call (demo data) |

Other scripts: `build`, `start` (runs `dist/`), `lint`, `format:check`, `typecheck`, `test`, `test:coverage`, `test:mutation`.

| Env var       | Default | Meaning                                              |
| ------------- | ------- | ---------------------------------------------------- |
| `PORT`        | `3000`  | Listen port                                          |
| `CORS_ORIGIN` | empty   | Comma-separated browser origins allowed. Empty: none |
