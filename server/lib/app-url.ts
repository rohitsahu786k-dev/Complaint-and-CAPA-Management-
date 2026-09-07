import { getEnv } from "../config/env";

/**
 * Returns the configured base application URL without trailing slashes.
 */
export function getAppUrl(): string {
  const configured = getEnv().APP_BASE_URL;
  if (configured && configured.trim().length > 0) {
    return configured.replace(/\/+$/, "");
  }
  return "http://localhost:5173";
}
