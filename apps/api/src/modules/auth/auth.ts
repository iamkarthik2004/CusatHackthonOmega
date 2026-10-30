import argon2 from "argon2";
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getPool } from "../../database/client.js";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(9)
}).strict();
const sessionCookie = "tally_session";
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function register(email: string, password: string) {
  const pool = getPool();
  if (!pool) throw new Error("Database is not configured");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'CUSTOMER') RETURNING id, email, role",
      [email, passwordHash]
    );
    const user = result.rows[0] as { id: string; email: string; role: string };
    await client.query(
      "INSERT INTO customers (user_id, legal_name, email) VALUES ($1, $2, $3)",
      [user.id, email.split("@")[0], email]
    );
    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function login(email: string, password: string, response: Response) {
  const pool = getPool();
  if (!pool) throw new Error("Database is not configured");
  const result = await pool.query(
    "SELECT id, email, role, password_hash FROM users WHERE email = $1 AND disabled_at IS NULL",
    [email]
  );
  const user = result.rows[0] as { id: string; email: string; role: string; password_hash: string } | undefined;
  if (!user || !(await argon2.verify(user.password_hash, password))) return false;
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 * interval '1 day'))",
    [user.id, hashToken(token), 7]
  );
  response.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  return { id: user.id, email: user.email, role: user.role };
}

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.cookies?.[sessionCookie] as string | undefined;
    const pool = getPool();
    if (!token || !pool) return response.status(401).json({ error: "Authentication required" });
    const result = await pool.query(
      `SELECT u.id, u.email, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`,
      [hashToken(token)]
    );
    if (!result.rowCount) return response.status(401).json({ error: "Session expired" });
    request.user = result.rows[0] as { id: string; email: string; role: string };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles: string[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) return response.status(403).json({ error: "Insufficient permissions" });
    return next();
  };
}

export function parseCredentials(body: unknown) {
  return credentialsSchema.parse(body);
}

export async function logout(request: Request, response: Response) {
  const token = request.cookies?.[sessionCookie] as string | undefined;
  const pool = getPool();
  if (token && pool) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  response.clearCookie(sessionCookie);
  return response.status(204).send();
}
