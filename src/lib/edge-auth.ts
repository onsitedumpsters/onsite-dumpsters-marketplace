import { jwtDecrypt } from "jose";
import { hkdf } from "@panva/hkdf";

export interface EdgeSessionUser {
  id: string;
  role: string;
}

function base64UrlDecodeToString(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/**
 * Decrypt an Auth.js v5 session token (JWE) by replicating @auth/core's key
 * derivation exactly: HKDF-SHA256(secret, salt=cookieName,
 * info="Auth.js Generated Encryption Key (<cookieName>)").
 *
 * Returns the session claims on success, or null when the token is missing,
 * malformed, tampered, expired, or encrypted with a different secret.
 */
export async function decryptSessionToken(
  token: string,
  cookieName: string,
  secret: string
): Promise<EdgeSessionUser | null> {
  if (!token || !secret) return null;
  try {
    const headerJson = JSON.parse(base64UrlDecodeToString(token.split(".")[0] ?? "")) as {
      enc?: string;
    };
    const keyLength = headerJson.enc === "A256GCM" ? 32 : 64;
    const key = await hkdf(
      "sha256",
      secret,
      cookieName,
      `Auth.js Generated Encryption Key (${cookieName})`,
      keyLength
    );
    const { payload } = await jwtDecrypt(token, key, {
      clockTolerance: 15,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256CBC-HS512", "A256GCM"],
    });
    const id =
      typeof payload.userId === "string"
        ? payload.userId
        : typeof payload.sub === "string"
          ? payload.sub
          : "";
    if (!id) return null;
    const role = typeof payload.role === "string" ? payload.role : "client";
    return { id, role };
  } catch {
    return null;
  }
}
