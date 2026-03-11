import { createHmac } from "crypto";

const TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Generate token: "{exp_timestamp}.{hmac_signature}" */
export function generateToken(secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_MAX_AGE;
  const sig = sign(String(exp), secret);
  return `${exp}.${sig}`;
}

/** Verify token: check signature + not expired */
export function verifyToken(token: string, secret: string): boolean {
  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const exp = token.substring(0, dot);
  const sig = token.substring(dot + 1);

  // Check signature
  const expectedSig = sign(exp, secret);
  if (sig !== expectedSig) return false;

  // Check expiry
  const expNum = parseInt(exp, 10);
  if (isNaN(expNum)) return false;
  return Math.floor(Date.now() / 1000) < expNum;
}
