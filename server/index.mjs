import express from "express";
import mysql from "mysql2/promise";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter, requireUser } from "./auth.mjs";
import { financeRouter } from "./finance.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5174);
const database = process.env.DB_NAME || "fluxo_pessoal";
const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "fluxo",
  password: process.env.DB_PASSWORD || "fluxo_local",
  database,
  dateStrings: true,
  supportBigNumbers: true,
  connectionLimit: 4,
});
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const index = fileURLToPath(new URL("../dist/index.html", import.meta.url));

const app = express();
app.disable("x-powered-by");
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.get("origin");
  if (origin && origin !== `${req.protocol}://${req.get("host")}`) {
    return res
      .status(403)
      .json({ error: "Abra o aplicativo pelo endereço local." });
  }
  next();
});
app.use("/api", express.json({ limit: "512kb" }));

app.get("/api/health", async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ ok: true });
});
app.use("/api", authRouter(db));
app.use("/api", requireUser(db), financeRouter(db));
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Rota inexistente." }),
);
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method === "GET" && !extname(req.path) && req.accepts("html")) {
    return res.sendFile(index);
  }
  next();
});

app.use((error, _req, res, _next) => {
  if (error.status >= 400 && error.status < 500) {
    const message =
      error.type === "entity.parse.failed" ? "JSON inválido." : error.message;
    return res.status(error.status).json({ error: message });
  }
  console.error(error);
  res.status(500).json({ error: "Não foi possível concluir a operação." });
});

try {
  if (!existsSync(index))
    throw new Error("Execute npm run build para gerar a interface.");
  const [tables] = await db.execute(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [database],
  );
  const expected = [
    "accounts",
    "cards",
    "categories",
    "installment_groups",
    "transactions",
    "user_profiles",
    "users",
  ];
  if (tables.map((table) => table.name).join(",") !== expected.join(",")) {
    throw new Error("Crie uma base nova com database/01-banco.sql.");
  }
  await db.query("SELECT id FROM vw_lancamentos LIMIT 0");
  const server = app.listen(port, host, () => {
    console.log(
      `Fluxo disponível em http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    );
  });
  let stopping = false;
  const closePool = () => db.end().catch(console.error);
  function stop() {
    if (stopping) return;
    stopping = true;
    server.close(() => void closePool());
  }
  server.once("error", (error) => {
    console.error(`Falha ao abrir a porta ${port}. ${error.message}`);
    stopping = true;
    void closePool();
    process.exitCode = 1;
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (error) {
  console.error(`Falha ao iniciar o Fluxo. ${error.message}`);
  if (["ER_BAD_DB_ERROR", "ER_NO_SUCH_TABLE"].includes(error.code)) {
    console.error("Crie a base com database/01-banco.sql.");
  }
  await db.end();
  process.exitCode = 1;
}
