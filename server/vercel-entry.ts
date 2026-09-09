import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "./app";

/**
 * Source for the Vercel serverless function. esbuild bundles this into api/index.js
 * so that every local import and @shared/* alias is inlined ahead of time: the
 * package is ESM ("type": "module"), and Node's ESM loader resolves neither
 * extensionless relative specifiers nor tsconfig path aliases at runtime.
 */

type ExpressApp = ReturnType<typeof createApp>;

let cachedApp: ExpressApp | null = null;

function getApp() {
  if (!cachedApp) {
    cachedApp = createApp();
  }
  return cachedApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = getApp();
    return app(req, res);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server initialization failed";
    console.error("Vercel Serverless Function Error:", message);
    return res.status(500).json({
      error: "SERVER_CONFIG_ERROR",
      message: `Server Configuration Error: ${message}. Check Vercel Project Settings > Environment Variables.`
    });
  }
}
