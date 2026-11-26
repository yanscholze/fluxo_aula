import {
  createHash,
  pbkdf2,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";

const deriveKey = promisify(pbkdf2);
const passwordIterations = 210_000;
const decoySalt = randomBytes(32).toString("hex");
const cookieName = "fluxo_session";
const sessionDays = 7;
const failureLimit = 8;
const windowMinutes = 15;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function readEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "Informe um e-mail válido.");
  }
  return email;
}

function readName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 255) {
    throw httpError(400, "Informe um nome de até 255 caracteres.");
  }
  return name;
}

function readPassword(value, minLength) {
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > 255
  ) {
    const message =
      minLength > 1
        ? "Use uma senha com 8 a 255 caracteres."
        : "Informe a senha.";
    throw httpError(400, message);
  }
  return value;
}

function passwordKey(password, salt, iterations = passwordIterations) {
  return deriveKey(
    password,
    Buffer.from(salt, "hex"),
    iterations,
    32,
    "sha256",
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function publicUser({ id, email, display_name }) {
  return { id, email, display_name };
}

function cookieOptions(req) {
  return { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/" };
}

function authCookie(req) {
  const token = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!token || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) return null;
  return { id: token.slice(0, 36), hash: sha256(token) };
}

async function findUser(db, req) {
  const session = authCookie(req);
  if (!session) return null;
  const [[user]] = await db.execute(
    `SELECT u.id, u.email, u.display_name
     FROM web_sessions AS s INNER JOIN users AS u ON u.id = s.user_id
     WHERE s.id = ? AND s.token_hash = ? AND s.revoked_at IS NULL
       AND s.expires_at > UTC_TIMESTAMP()`,
    [session.id, session.hash],
  );
  return user ?? null;
}

async function createSession(db, userId) {
  const id = randomUUID();
  const token = id + "." + randomBytes(32).toString("hex");
  await db.execute(
    `INSERT INTO web_sessions (id, user_id, token_hash, expires_at, last_seen_at)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${sessionDays} DAY), UTC_TIMESTAMP())`,
    [id, userId, sha256(token)],
  );
  return token;
}

function replyWithSession(req, res, user, token, status = 200) {
  res.cookie(cookieName, token, {
    ...cookieOptions(req),
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
  });
  res.status(status).json({ user: publicUser(user) });
}

async function withTransaction(db, work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function verifyLogin(db, req, email, password) {
  const key = sha256("login:" + req.ip);
  return withTransaction(db, async (connection) => {
    await connection.execute(
      `INSERT INTO auth_rate_limits (key_hash, scope, window_started_at)
       VALUES (?, 'login', UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE key_hash = key_hash`,
      [key],
    );
    const [[limit]] = await connection.execute(
      `SELECT failures, blocked_until > UTC_TIMESTAMP() AS blocked,
              window_started_at > UTC_TIMESTAMP() - INTERVAL ${windowMinutes} MINUTE AS within_window
       FROM auth_rate_limits WHERE key_hash = ? FOR UPDATE`,
      [key],
    );
    if (limit.blocked) {
      throw httpError(
        429,
        "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
      );
    }

    const [[user]] = await connection.execute(
      `SELECT id, email, display_name, password_hash, password_salt, password_iterations
       FROM users WHERE email = ?`,
      [email],
    );
    const derived = await passwordKey(
      password,
      user?.password_salt ?? decoySalt,
      user?.password_iterations ?? passwordIterations,
    );
    const stored = Buffer.from(user?.password_hash ?? "", "hex");
    if (
      user &&
      stored.length === derived.length &&
      timingSafeEqual(stored, derived)
    ) {
      await connection.execute(
        "DELETE FROM auth_rate_limits WHERE key_hash = ?",
        [key],
      );
      const token = await createSession(connection, user.id);
      return { user: publicUser(user), token };
    }

    const failures = limit.within_window ? limit.failures + 1 : 1;
    await connection.execute(
      `UPDATE auth_rate_limits
       SET failures = ?, window_started_at = IF(?, window_started_at, UTC_TIMESTAMP()),
           blocked_until = IF(?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${windowMinutes} MINUTE), NULL),
           updated_at = UTC_TIMESTAMP()
       WHERE key_hash = ?`,
      [failures, Boolean(limit.within_window), failures >= failureLimit, key],
    );
    return null;
  });
}

export function requireUser(db) {
  return async (req, _res, next) => {
    const user = await findUser(db, req);
    if (!user) throw httpError(401, "Entre para continuar.");
    req.user = user;
    next();
  };
}

export function authRouter(db) {
  const router = Router();

  router.get("/session", async (req, res) => {
    res
      .set("Cache-Control", "no-store")
      .json({ user: await findUser(db, req) });
  });

  router.post("/register", async (req, res) => {
    const email = readEmail(req.body?.email);
    const display_name = readName(req.body?.display_name);
    const password = readPassword(req.body?.password, 8);
    const salt = randomBytes(32).toString("hex");
    const hash = (await passwordKey(password, salt)).toString("hex");
    const user = { id: randomUUID(), email, display_name };

    const token = await withTransaction(db, async (connection) => {
      try {
        await connection.execute(
          `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [user.id, email, display_name, hash, salt, passwordIterations],
        );
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          throw httpError(409, "Já existe uma conta com esse e-mail.");
        }
        throw error;
      }
      return createSession(connection, user.id);
    });
    replyWithSession(req, res, user, token, 201);
  });

  router.post("/login", async (req, res) => {
    const email = readEmail(req.body?.email);
    const password = readPassword(req.body?.password, 1);
    const session = await verifyLogin(db, req, email, password);
    if (!session) throw httpError(401, "E-mail ou senha inválidos.");
    replyWithSession(req, res, session.user, session.token);
  });

  router.post("/logout", async (req, res) => {
    const session = authCookie(req);
    if (session) {
      await db.execute(
        `UPDATE web_sessions SET revoked_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
         WHERE id = ? AND token_hash = ? AND revoked_at IS NULL`,
        [session.id, session.hash],
      );
    }
    res.clearCookie(cookieName, cookieOptions(req)).json({ user: null });
  });

  router.patch("/profile", requireUser(db), async (req, res) => {
    const display_name = readName(req.body?.display_name);
    await db.execute(
      "UPDATE users SET display_name = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
      [display_name, req.user.id],
    );
    res.json({ user: { ...req.user, display_name } });
  });

  return router;
}
