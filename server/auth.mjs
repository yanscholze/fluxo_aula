import {
  createHmac,
  pbkdf2,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";

const deriveKey = promisify(pbkdf2);
const iterations = 210_000;
const sessionSeconds = 7 * 24 * 60 * 60;
const sessionKey = process.env.SESSION_SECRET || randomBytes(32);
const cookieName = "fluxo_session";
const dummySalt = randomBytes(32).toString("hex");

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function emailValue(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(400, "Informe um e-mail válido.");
  }
  return email;
}

function nameValue(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 255)
    fail(400, "Informe um nome de até 255 caracteres.");
  return name;
}

function passwordValue(value, minimum) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > 255
  ) {
    fail(
      400,
      minimum === 8
        ? "Use uma senha com 8 a 255 caracteres."
        : "Informe a senha.",
    );
  }
  return value;
}

function passwordKey(password, salt, cost = iterations) {
  return deriveKey(password, Buffer.from(salt, "hex"), cost, 32, "sha256");
}

function signature(value) {
  return createHmac("sha256", sessionKey).update(value).digest();
}

function options(req) {
  return { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/" };
}

function signedIn(req, res, user, status = 200) {
  const subject = Buffer.from(user.id).toString("base64url");
  const expiry = Math.floor(Date.now() / 1000) + sessionSeconds;
  const value = `${subject}.${expiry}`;
  res.cookie(cookieName, `${value}.${signature(value).toString("hex")}`, {
    ...options(req),
    maxAge: sessionSeconds * 1000,
  });
  res.status(status).json({ user });
}

function sessionId(req) {
  const prefix = cookieName + "=";
  const token = req
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  const match = token?.match(
    /^([a-zA-Z0-9_-]{1,344})\.(\d{1,12})\.([a-f0-9]{64})$/,
  );
  if (!match) return null;
  const [, subject, expiry, hex] = match;
  if (Number(expiry) <= Date.now() / 1000) return null;
  if (
    !timingSafeEqual(signature(`${subject}.${expiry}`), Buffer.from(hex, "hex"))
  )
    return null;
  return Buffer.from(subject, "base64url").toString("utf8");
}

async function readProfile(db, id) {
  if (!id) return null;
  const [[user]] = await db.execute(
    `SELECT u.id, u.email, u.display_name, p.avatar_data
       FROM users AS u LEFT JOIN user_profiles AS p ON p.owner_id = u.id
      WHERE u.id = ?`,
    [id],
  );
  return user ?? null;
}

export function requireUser(db) {
  return async (req, _res, next) => {
    const id = sessionId(req);
    if (!id) fail(401, "Entre para continuar.");
    const [[user]] = await db.execute("SELECT id FROM users WHERE id = ?", [
      id,
    ]);
    if (!user) fail(401, "Entre para continuar.");
    req.user = user;
    next();
  };
}

export function authRouter(db) {
  const router = Router();

  router.get("/session", async (req, res) => {
    res.json({ user: await readProfile(db, sessionId(req)) });
  });

  router.post("/register", async (req, res) => {
    const email = emailValue(req.body?.email);
    const display_name = nameValue(req.body?.display_name);
    const password = passwordValue(req.body?.password, 8);
    const id = randomUUID();
    const salt = randomBytes(32).toString("hex");
    const hash = (await passwordKey(password, salt)).toString("hex");
    try {
      await db.execute(
        `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, email, display_name, hash, salt, iterations],
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        fail(409, "Já existe uma conta com esse e-mail.");
      throw error;
    }
    signedIn(req, res, { id, email, display_name, avatar_data: null }, 201);
  });

  router.post("/login", async (req, res) => {
    const email = emailValue(req.body?.email);
    const password = passwordValue(req.body?.password, 1);
    const [[record]] = await db.execute(
      `SELECT id, password_hash, password_salt, password_iterations
         FROM users WHERE email = ?`,
      [email],
    );
    const derived = await passwordKey(
      password,
      record?.password_salt ?? dummySalt,
      record?.password_iterations ?? iterations,
    );
    const stored = Buffer.from(record?.password_hash ?? "", "hex");
    if (
      !record ||
      stored.length !== derived.length ||
      !timingSafeEqual(stored, derived)
    ) {
      fail(401, "E-mail ou senha inválidos.");
    }
    const user = await readProfile(db, record.id);
    if (!user) fail(401, "E-mail ou senha inválidos.");
    signedIn(req, res, user);
  });

  router.post("/logout", (req, res) => {
    res.clearCookie(cookieName, options(req)).json({ user: null });
  });

  router.patch("/profile", requireUser(db), async (req, res) => {
    const name = nameValue(req.body?.display_name);
    const avatar = req.body?.avatar_data;
    if (
      avatar != null &&
      (typeof avatar !== "string" ||
        avatar.length > 360_000 ||
        !/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}$/.test(
          avatar,
        ))
    ) {
      fail(400, "Escolha uma imagem PNG, JPEG, WebP ou GIF de até 250 KB.");
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const id = req.user.id;
      await connection.execute(
        "UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [name, id],
      );
      if (avatar === null) {
        await connection.execute(
          "DELETE FROM user_profiles WHERE owner_id = ?",
          [id],
        );
      } else if (avatar !== undefined) {
        await connection.execute(
          `INSERT INTO user_profiles (owner_id, avatar_data) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE avatar_data = ?, updated_at = CURRENT_TIMESTAMP`,
          [id, avatar, avatar],
        );
      }
      const user = await readProfile(connection, id);
      await connection.commit();
      res.json({ user });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });

  return router;
}
