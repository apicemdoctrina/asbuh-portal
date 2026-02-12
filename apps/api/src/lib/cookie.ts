import type { Response } from "express";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_PATH = "/api/auth";

// 7 days in milliseconds
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_PATH,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: REFRESH_PATH,
  });
}

export function getRefreshCookie(cookies: Record<string, string>): string | undefined {
  return cookies[REFRESH_COOKIE];
}
