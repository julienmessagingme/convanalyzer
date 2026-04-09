import { NextResponse } from "next/server";
import { loginLocal } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";
import { COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email et mot de passe requis" },
      { status: 400 }
    );
  }

  const user = await loginLocal(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "Email ou mot de passe incorrect" },
      { status: 401 }
    );
  }

  const token = await signSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    authType: "local",
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
