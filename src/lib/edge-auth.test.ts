import { describe, it, expect } from "vitest";
import { encode } from "@auth/core/jwt";
import { decryptSessionToken } from "./edge-auth";

const SECRET = "test-secret-for-edge-auth-roundtrip";
const COOKIE = "__Secure-authjs.session-token";

async function issueToken(payload: Record<string, unknown>, secret = SECRET, salt = COOKIE) {
  return encode({ token: payload, secret, salt, maxAge: 3600 });
}

describe("decryptSessionToken (Auth.js v5 JWE compatibility)", () => {
  it("decrypts a token issued by @auth/core and returns id + role", async () => {
    const token = await issueToken({ userId: "user-123", role: "admin", sub: "user-123" });
    const user = await decryptSessionToken(token, COOKIE, SECRET);
    expect(user).toEqual({ id: "user-123", role: "admin" });
  });

  it("defaults a missing role claim to client", async () => {
    const token = await issueToken({ userId: "user-456", sub: "user-456" });
    const user = await decryptSessionToken(token, COOKIE, SECRET);
    expect(user).toEqual({ id: "user-456", role: "client" });
  });

  it("rejects tokens encrypted with a different secret", async () => {
    const token = await issueToken({ userId: "user-123", role: "admin" });
    await expect(decryptSessionToken(token, COOKIE, "wrong-secret")).resolves.toBeNull();
  });

  it("rejects tokens when the cookie-name salt differs", async () => {
    const token = await issueToken({ userId: "user-123", role: "admin" }, SECRET, "other-cookie");
    await expect(decryptSessionToken(token, COOKIE, SECRET)).resolves.toBeNull();
  });

  it("rejects tampered tokens", async () => {
    const token = await issueToken({ userId: "user-123", role: "admin" });
    const parts = token.split(".");
    parts[3] = parts[3].slice(0, -2) + "AA";
    await expect(decryptSessionToken(parts.join("."), COOKIE, SECRET)).resolves.toBeNull();
  });

  it("rejects expired tokens", async () => {
    // @auth/core's encode() always sets exp from maxAge, so craft an expired
    // token directly with the same JWE parameters and key derivation.
    const { EncryptJWT } = await import("jose");
    const { hkdf } = await import("@panva/hkdf");
    const key = await hkdf(
      "sha256",
      SECRET,
      COOKIE,
      `Auth.js Generated Encryption Key (${COOKIE})`,
      64
    );
    const token = await new EncryptJWT({ userId: "user-123", role: "admin" })
      .setProtectedHeader({ alg: "dir", enc: "A256CBC-HS512" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .encrypt(key);
    await expect(decryptSessionToken(token, COOKIE, SECRET)).resolves.toBeNull();
  });

  it("returns null for empty token or secret", async () => {
    const token = await issueToken({ userId: "user-123" });
    await expect(decryptSessionToken("", COOKIE, SECRET)).resolves.toBeNull();
    await expect(decryptSessionToken(token, COOKIE, "")).resolves.toBeNull();
    await expect(decryptSessionToken("not-a-token", COOKIE, SECRET)).resolves.toBeNull();
  });
});
