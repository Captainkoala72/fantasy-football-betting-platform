import { db } from "@/db";
import { ledger, users, STARTING_BALANCE_CENTS, type UserRow } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ll_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type PublicUser = {
  id: number;
  username: string;
  displayName: string;
  balanceCents: number;
  createdAt: string;
};

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    balanceCents: Number(u.balanceCents),
    createdAt: u.createdAt.toISOString(),
  };
}

function hashPin(pin: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const h = scryptSync(pin, s, 32).toString("hex");
  return `${s}:${h}`;
}

function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = hashPin(pin, salt).split(":")[1];
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function validateCredentials(username: string, pin: string): string | null {
  if (username.length < 3 || username.length > 20) return "Username must be 3–20 letters, numbers or underscores.";
  if (!/^\d{4,8}$/.test(pin)) return "PIN must be 4–8 digits.";
  return null;
}

export async function signUp(rawUsername: string, displayName: string, pin: string): Promise<{ user: UserRow } | { error: string }> {
  const username = normalizeUsername(rawUsername);
  const err = validateCredentials(username, pin);
  if (err) return { error: err };
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing.length) return { error: "That username is taken. Sign in with your PIN instead." };
  const token = randomBytes(32).toString("hex");
  const [user] = await db
    .insert(users)
    .values({
      username,
      displayName: displayName.trim().slice(0, 32) || rawUsername.trim().slice(0, 32),
      pinHash: hashPin(pin),
      sessionToken: token,
      balanceCents: STARTING_BALANCE_CENTS,
    })
    .returning();
  await db.insert(ledger).values({
    userId: user.id,
    kind: "deposit",
    amountCents: STARTING_BALANCE_CENTS,
    balanceAfterCents: STARTING_BALANCE_CENTS,
    note: "Welcome bankroll",
  });
  return { user };
}

export async function signIn(rawUsername: string, pin: string): Promise<{ user: UserRow } | { error: string }> {
  const username = normalizeUsername(rawUsername);
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || !verifyPin(pin, user.pinHash)) return { error: "Username or PIN is incorrect." };
  // rotate session token on each sign-in
  const token = randomBytes(32).toString("hex");
  const [updated] = await db
    .update(users)
    .set({ sessionToken: token, lastSeenAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  return { user: updated };
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [user] = await db.select().from(users).where(eq(users.sessionToken, token)).limit(1);
  return user ?? null;
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    // Play-money app; previews are often served over plain HTTP behind a proxy.
    secure: false,
  };
}
