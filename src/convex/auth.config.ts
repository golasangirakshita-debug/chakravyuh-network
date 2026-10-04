import type { AuthConfig } from "convex/server";

// Freebuff-signed federated tokens (see freebuff web's
// src/lib/vly-convex-jwt.ts) let a signed-in freebuff.com user carry their
// identity into this project without going through local sign-in. customJwt
// is correct for this provider: freebuff's tokens and JWKS both carry a
// `kid` header, which the customJwt validation path requires.
const freebuffIssuer =
  process.env.VLY_CONVEX_AUTH_ISSUER ?? "https://freebuff.com";

export default {
  providers: [
  {
    domain: "https://mellow-hippopotamus-876.eu-west-1.convex.site",
    applicationID: "convex",
  },
  {
    type: "customJwt",
    issuer: freebuffIssuer,
    jwks: `${freebuffIssuer}/api/web/.well-known/jwks.json`,
    applicationID: "vly-convex",
    algorithm: "RS256",
  },
],
} satisfies AuthConfig;
