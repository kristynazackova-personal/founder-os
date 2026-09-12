import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { env } from "./env";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "./crypto";
import type { User } from "./db/schema";

const COOKIE = "fos_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ id: sha256Hex(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256Hex(token)));
  }
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, sha256Hex(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt < new Date()) return null;
  return row.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function registerUser(email: string, password: string, name: string | null): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const db = await getDb();
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { ok: false, error: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, error: "Password needs at least 8 characters." };
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, normalized)).limit(1);
  if (existing.length) return { ok: false, error: "There's already an account with that email. Log in instead." };
  const [user] = await db.insert(schema.users).values({ email: normalized, passwordHash: hashPassword(password), name }).returning();
  return { ok: true, user };
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const db = await getDb();
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, normalized)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}
