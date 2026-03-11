import { headers } from "next/headers";

export async function getReqIp(): Promise<string | null> {
  const h = await headers();

  const cfIP = h.get("cf-connecting-ip");
  if (cfIP) return cfIP;

  const xForwardedFor = h.get("x-forwarded-for");
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();

  const xRealIP = h.get("x-real-ip");
  if (xRealIP) return xRealIP;

  return null;
}
