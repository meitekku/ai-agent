"use server";

import { cookies } from "next/headers";
import { getReqIp } from "@/lib/get-req-ip";
import { generateToken } from "@/lib/auth-token";
import {
  checkGateRateLimit,
  recordGateFailure,
  clearGateAttempts,
} from "@/lib/gate-rate-limit";

const AUTH_COOKIE_NAME = "pw";

export async function verifyPw(pw: string) {
  const PW = process.env.PW;
  if (!PW) return { success: false };

  const ip = await getReqIp();

  if (ip) {
    const rateLimit = await checkGateRateLimit(ip);
    if (!rateLimit.allowed) {
      return {
        success: false,
        rateLimited: true,
        remainingSeconds: rateLimit.remainingSeconds,
      };
    }
  }

  if (pw !== PW) {
    if (ip) await recordGateFailure(ip);
    return { success: false };
  }

  // Password correct → generate signed token, set cookie server-side
  if (ip) await clearGateAttempts(ip);

  const token = generateToken(PW);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
  });

  return { success: true };
}
