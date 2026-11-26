import express from "express";
import mysql from "mysql2/promise";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter, requireUser } from "./auth.mjs";
import { financeRouter } from "./finance.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5174);
const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "fluxo",
  password: process.env.DB_PASSWORD || "fluxo_local",
  database: "fluxo_pessoal",
  charset: "utf8mb4",
  dateStrings: true,
  supportBigNumbers: true,
  connectionLimit: 8,
});
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const index = fileURLToPath(new URL("../dist/index.html", import.meta.url));
const app = express();
app.disable("x-powered-by");

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.get("origin");
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || !origin) return next();
  const requestOrigin = `${req.protocol}://${req.get("host")}`;
  if (origin === (process.env.APP_ORIGIN || requestOrigin)) return next();
  res.status(403).json({ error: "Origem da solicitação inválida." });
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
  if (req.method === "GET" && !extname(req.path) && req.accepts("html"))
    return res.sendFile(index);
  next();
});
app.use((error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status >= 500) console.error(error);
  const message =
    status >= 500
      ? "Não foi possível concluir a operação. Consulte o terminal do servidor."
      : error.type === "entity.parse.failed"
        ? "JSON inválido."
        : error.message;
  res.status(status).json({ error: message });
});

try {
  if (!existsSync(index))
    throw new Error("Execute npm run build para gerar a interface.");
  const [columns] = await db.query(
    "SHOW COLUMNS FROM transactions LIKE 'account'",
  );
  if (columns[0]?.Type !== "varchar(64)") {
    throw new Error("Execute database/02-referencias-de-contas.sql no MySQL.");
  }
  try {
    await db.query("SELECT valor_origem_centavos FROM vw_lancamentos LIMIT 0");
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      throw new Error("Execute database/03-recursos-academicos.sql no MySQL.");
    }
    throw error;
  }
  const server = app.listen(port, host, () => {
    console.log(
      `Fluxo disponível em http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    );
  });
  let stopping = false;
  const closePool = () =>
    db.end().catch((error) => {
      console.error(`Falha ao fechar a conexão com o MySQL. ${error.message}`);
      process.exitCode = 1;
    });
  server.on("error", (error) => {
    console.error(`Falha ao abrir a porta ${port}. ${error.message}`);
    stopping = true;
    void closePool();
    process.exitCode = 1;
  });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => void closePool());
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (error) {
  console.error(`Falha ao iniciar o Fluxo. ${error.message}`);
  await db.end();
  process.exitCode = 1;
}
