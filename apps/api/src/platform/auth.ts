import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { z } from "zod";
import type { configuration } from "./config";
export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
};
type Config = ReturnType<typeof configuration>;
let config: Config;
let keys: JWTVerifyGetKey;
export function configureAuth(value: Config, testKeys?: JWTVerifyGetKey) {
  config = value;
  if (!value.devAuth)
    keys = testKeys || createRemoteJWKSet(new URL(value.jwksUrl!));
}
export function claimsToUser(
  payload: JWTPayload,
  requiredGroup?: string,
  groupClaim = "groups",
): AuthenticatedUser | null {
  const groups = payload[groupClaim];
  if (
    requiredGroup &&
    (!Array.isArray(groups) || !groups.includes(requiredGroup))
  )
    return null;
  if (
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.sub.length > 200
  )
    return null;
  const email =
    typeof payload.email === "string" ? payload.email.slice(0, 254) : "";
  // Email is display metadata; verified email can additionally restrict a targeted invite.
  const name =
    typeof payload.name === "string"
      ? payload.name.slice(0, 120)
      : email || payload.sub;
  return {
    userId: payload.sub,
    displayName: name,
    email,
    emailVerified:
      payload.email_verified === true &&
      z.string().email().max(254).safeParse(payload.email).success,
    fullName: name,
  };
}
export async function verifyIdentity(
  token: string,
  key: JWTVerifyGetKey,
  issuer: string,
  audience: string,
  requiredGroup?: string,
  groupClaim = "groups",
) {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer,
      audience,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["sub", "exp", "iat"],
      clockTolerance: 5,
    });
    return claimsToUser(payload, requiredGroup, groupClaim);
  } catch {
    return null;
  }
}
export async function getAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  if (!config) throw Error("Authentication not configured");
  if (config.devAuth) {
    return request.headers.get("authorization") === "Bearer local-development"
      ? {
          userId: "local_seedy",
          displayName: "Seedy",
          email: "developer@localhost",
          emailVerified: true,
          fullName: "Seedy",
        }
      : null;
  }
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 16000) return null;
  return verifyIdentity(
    header.slice(7),
    keys,
    config.issuer!,
    config.audience!,
    config.requiredGroup,
    config.groupClaim,
  );
}
