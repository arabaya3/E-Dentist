import jwt from "jsonwebtoken";

const TOKEN_TTL_SECONDS = 60 * 60;

function getJwtSecret() {
  const secret = process.env.EDENTIST_JWT_SECRET;
  if (!secret) {
    throw new Error("EDENTIST_JWT_SECRET is not set");
  }
  if (secret.length < 32) {
    throw new Error("EDENTIST_JWT_SECRET must be at least 32 characters");
  }
  return secret;
}

export interface TokenPayload {
  sub: string;
  scope?: string[];
  role?: string;
  iss?: string;
  aud?: string[];
}

export function issueJWT(payload: TokenPayload, expiresInSeconds?: number) {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      ...payload,
    },
    secret,
    {
      expiresIn: expiresInSeconds ?? TOKEN_TTL_SECONDS,
      issuer: payload.iss ?? "eDentist.AI",
    }
  );
}

export function verifyJWT(token: string) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as TokenPayload & jwt.JwtPayload;
}

export function requireScope(scopes: string[] = []) {
  return (payload: TokenPayload & jwt.JwtPayload) => {
    if (!scopes.length) {
      return true;
    }
    const tokenScopes = new Set(payload.scope ?? []);
    const missing = scopes.filter((scope) => !tokenScopes.has(scope));
    if (missing.length) {
      throw new Error(`Missing required scopes: ${missing.join(", ")}`);
    }
    return true;
  };
}

