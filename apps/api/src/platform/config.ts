export function configuration(input: NodeJS.ProcessEnv = process.env) {
  const production = input.NODE_ENV === "production";
  const origin = new URL(input.APP_ORIGIN || "http://127.0.0.1:5174");
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw Error("APP_ORIGIN must be an origin");
  const devAuth = input.DEV_AUTH === "true";
  if (production && (devAuth || origin.protocol !== "https:"))
    throw Error("Production requires HTTPS and rejects DEV_AUTH");
  if (
    !devAuth &&
    (!input.OIDC_ISSUER || !input.OIDC_AUDIENCE || !input.OIDC_JWKS_URL)
  )
    throw Error("Configure OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL");
  if (!devAuth) {
    for (const value of [input.OIDC_ISSUER!, input.OIDC_JWKS_URL!]) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("OIDC requires HTTPS");
    }
  }
  const host = input.API_HOST || "127.0.0.1";
  if (devAuth && !["127.0.0.1", "::1"].includes(host))
    throw Error("Development identity must bind to loopback");
  if (!input.DATABASE_URL) throw Error("DATABASE_URL is required");
  return {
    production,
    devAuth,
    host,
    port: Number(input.PORT || 4000),
    origin: origin.origin,
    databaseUrl: input.DATABASE_URL!,
    issuer: input.OIDC_ISSUER,
    audience: input.OIDC_AUDIENCE,
    jwksUrl: input.OIDC_JWKS_URL,
    requiredGroup: input.OIDC_REQUIRED_GROUP,
    groupClaim: input.OIDC_GROUP_CLAIM || "groups",
  };
}
