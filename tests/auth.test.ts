import test from "node:test";
import assert from "node:assert/strict";
import {
  issueSession,
  validSession,
  validEntry,
  assertOrigin,
  assertWritable,
  SESSION_SECONDS,
} from "../src/lib/admin-auth";
process.env.ADMIN_ENTRY_SECRET = "a".repeat(64);
process.env.ADMIN_SESSION_SECRET = "b".repeat(64);
test("secret entry rejects guessed routes and sessions expire or reject tampering", () => {
  assert.equal(validEntry("admin"), false);
  assert.equal(validEntry("a".repeat(64)), true);
  const now = Date.now(),
    session = issueSession(now);
  assert.equal(validSession(session, now), true);
  assert.equal(validSession(session + "x", now), false);
  assert.equal(validSession(session, now + SESSION_SECONDS * 1000 + 1), false);
  assert.equal(validSession(undefined), false);
});
test("rotating entry invalidates existing sessions", () => {
  const session = issueSession();
  process.env.ADMIN_ENTRY_SECRET = "c".repeat(64);
  assert.equal(validSession(session), false);
  process.env.ADMIN_ENTRY_SECRET = "a".repeat(64);
});
test("mutations require exact Origin and preview writes are denied", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  assert.throws(() =>
    assertOrigin(
      new Request("https://example.test/api/admin", {
        headers: { Origin: "https://evil.test" },
      }),
    ),
  );
  assert.throws(() =>
    assertOrigin(new Request("https://example.test/api/admin")),
  );
  assert.doesNotThrow(() =>
    assertOrigin(
      new Request("https://example.test/api/admin", {
        headers: { Origin: "https://example.test" },
      }),
    ),
  );
  process.env.VERCEL_ENV = "preview";
  assert.throws(assertWritable);
  delete process.env.VERCEL_ENV;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});
