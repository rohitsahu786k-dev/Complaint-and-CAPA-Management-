import type { VercelRequest, VercelResponse } from "@vercel/node";

let cachedApp: any = null;

async function getApp() {
  if (!cachedApp) {
    const { createApp } = await import("../server/app");
    cachedApp = createApp();
  }
  return cachedApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();
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
