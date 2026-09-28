import { NextResponse, type NextRequest } from "next/server";
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (
    request.nextUrl.pathname.startsWith("/api/admin") ||
    /^\/[a-f0-9]{64}\//.test(request.nextUrl.pathname)
  ) {
    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  return response;
}
