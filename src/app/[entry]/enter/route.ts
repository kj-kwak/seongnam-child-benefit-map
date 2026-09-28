import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE,
  SESSION_SECONDS,
  issueSession,
  validEntry,
  privateHeaders,
} from "@/lib/admin-auth";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entry: string }> },
) {
  const { entry } = await params;
  if (!validEntry(entry))
    return new Response("Not found", { status: 404, headers: privateHeaders });
  const response = NextResponse.redirect(
    new URL(`/${entry}/review`, request.url),
  );
  for (const [k, v] of Object.entries(privateHeaders))
    response.headers.set(k, v);
  response.cookies.set(COOKIE, issueSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}
