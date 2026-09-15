import { NextRequest, NextResponse } from "next/server";
import { sessionCookie, signIn, signUp, toPublicUser, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { mode?: string; username?: string; displayName?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const username = String(body.username ?? "");
  const pin = String(body.pin ?? "");
  const result =
    body.mode === "signup"
      ? await signUp(username, String(body.displayName ?? username), pin)
      : await signIn(username, pin);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const res = NextResponse.json({ user: toPublicUser(result.user) });
  res.cookies.set(sessionCookie(result.user.sessionToken));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
