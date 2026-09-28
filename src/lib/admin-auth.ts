import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const COOKIE = "seongnam-admin";
export const SESSION_SECONDS = 4 * 60 * 60;
export class AdminError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function authConfigured() {
  return (
    /^[a-f0-9]{64}$/.test(process.env.ADMIN_ENTRY_SECRET || "") &&
    (process.env.ADMIN_SESSION_SECRET || "").length >= 64
  );
}
export function validEntry(entry: string) {
  return authConfigured() && equal(entry, process.env.ADMIN_ENTRY_SECRET || "");
}
function signature(value: string) {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "")
    .update(`${process.env.ADMIN_ENTRY_SECRET}\0${value}`)
    .digest("base64url");
}
export function issueSession(now = Date.now()) {
  if (!authConfigured()) throw new AdminError("관리자 설정이 필요합니다.", 503);
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(now / 1000) + SESSION_SECONDS,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function validSession(value: string | undefined, now = Date.now()) {
  if (!authConfigured() || !value || value.length > 512) return false;
  const [payload, sig, ...rest] = value.split(".");
  if (rest.length || !sig || !equal(signature(payload), sig)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      typeof decoded.exp === "number" &&
      decoded.exp > now / 1000 &&
      decoded.exp <= now / 1000 + SESSION_SECONDS &&
      typeof decoded.nonce === "string"
    );
  } catch {
    return false;
  }
}
export function assertOrigin(request: Request) {
  const expected = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new AdminError("허용되지 않은 요청입니다.", 403);
}
export function assertWritable() {
  if (process.env.VERCEL_ENV === "preview")
    throw new AdminError(
      "미리보기 배포에서는 데이터를 변경할 수 없습니다.",
      403,
    );
}
export const privateHeaders = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};
