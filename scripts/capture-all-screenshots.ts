import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { signSession } from "../server/services/auth.service";
import { signCookieValue } from "../server/utils/signed-cookie";
import { getEnv } from "../server/config/env";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/screenshots");

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const token = signSession("6a9fa713e4483541d33beef2"); // Master Admin ID
  const signed = signCookieValue(token, getEnv().COOKIE_SECRET);

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
  });

  const page = await browser.newPage();

  // 1. Capture Login Screen
  console.log("Capturing 01_login_screen.png...");
  await page.goto("http://localhost:5173/login", { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_login_screen.png") });

  // Now set auth cookie
  await page.setCookie({
    name: "onepws_session",
    value: encodeURIComponent(signed),
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false
  });

  // Top level pages
  const pages = [
    { name: "02_dashboard_kpis.png", url: "http://localhost:5173/" },
    { name: "03_complaints_register.png", url: "http://localhost:5173/complaints" },
    { name: "04_new_complaint_wizard.png", url: "http://localhost:5173/complaints/new" },
    { name: "05_complaint_overview.png", url: "http://localhost:5173/complaints/6aab7e064397862b3d4978b0" },
    { name: "13_capa_dashboard.png", url: "http://localhost:5173/capa" },
    { name: "14_capa_tracker.png", url: "http://localhost:5173/capa/tracker" },
    { name: "15_capa_master.png", url: "http://localhost:5173/capa/master" },
    { name: "16_tat_dashboard.png", url: "http://localhost:5173/tat" },
    { name: "17_repeat_analysis.png", url: "http://localhost:5173/repeat" },
    { name: "18_reports_catalog.png", url: "http://localhost:5173/reports" },
    { name: "19_audit_trail.png", url: "http://localhost:5173/audit" },
    { name: "20_import_export.png", url: "http://localhost:5173/import-export" },
    { name: "21_master_data.png", url: "http://localhost:5173/master-data" },
    { name: "22_email_admin.png", url: "http://localhost:5173/email-admin" },
    { name: "23_user_profile.png", url: "http://localhost:5173/profile" }
  ];

  for (const item of pages) {
    console.log(`Capturing ${item.name}...`);
    try {
      await page.goto(item.url, { waitUntil: "networkidle0", timeout: 15000 });
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, item.name) });
    } catch (e) {
      console.warn(`Warning on ${item.name}:`, (e as Error).message);
    }
  }

  // Next, open the complaint detail page and click tabs
  const complaintUrl = "http://localhost:5173/complaints/6aab7e064397862b3d4978b0";
  console.log("Navigating to complaint detail page for tabs...");
  await page.goto(complaintUrl, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1000));

  // Click 8D Investigation tab
  console.log("Clicking 8D Investigation tab...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav button"));
    const target = btns.find((b) => b.textContent?.includes("8D Investigation"));
    if (target) (target as HTMLElement).click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // Capture top of 8D Investigation (D0, D1, D2)
  console.log("Capturing 06_8d_containment_d0_d1.png...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_8d_containment_d0_d1.png") });

  // Scroll to D2 / D3
  console.log("Scrolling to D3 Interim Actions & D4 RCA...");
  await page.evaluate(() => {
    window.scrollBy({ top: 750, behavior: "instant" });
  });
  await new Promise((r) => setTimeout(r, 600));
  console.log("Capturing 08_8d_interim_actions_d3.png...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_8d_interim_actions_d3.png") });

  // Scroll to D4 Fishbone and 5-Why
  console.log("Scrolling to D4 Fishbone 6M...");
  await page.evaluate(() => {
    window.scrollBy({ top: 750, behavior: "instant" });
  });
  await new Promise((r) => setTimeout(r, 600));
  console.log("Capturing 09_8d_rca_fishbone_d4.png...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_8d_rca_fishbone_d4.png") });

  // Scroll to D5 / D6 Corrective Actions
  console.log("Scrolling to D5/D6 Corrective Actions...");
  await page.evaluate(() => {
    window.scrollBy({ top: 800, behavior: "instant" });
  });
  await new Promise((r) => setTimeout(r, 600));
  console.log("Capturing 10_8d_corrective_actions_d5_d6.png...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_8d_corrective_actions_d5_d6.png") });

  // Scroll to D7 / D8 and Signatures
  console.log("Scrolling to D7/D8 Prevention & Signatures...");
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
  });
  await new Promise((r) => setTimeout(r, 600));
  console.log("Capturing 11_8d_preventive_d7_d8.png...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_8d_preventive_d7_d8.png") });
  console.log("Capturing 12_electronic_signatures.png...");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12_electronic_signatures.png") });

  // Click CAPA Actions tab inside complaint
  console.log("Clicking CAPA Actions tab...");
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const btns = Array.from(document.querySelectorAll("nav button"));
    const target = btns.find((b) => b.textContent?.includes("CAPA Actions"));
    if (target) (target as HTMLElement).click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_complaint_capa_tab.png") });

  // Click Workflow Timeline tab inside complaint
  console.log("Clicking Workflow Timeline tab...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav button"));
    const target = btns.find((b) => b.textContent?.includes("Workflow Timeline"));
    if (target) (target as HTMLElement).click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "24_complaint_timeline_tab.png") });

  // Click Attachments tab inside complaint
  console.log("Clicking Attachments tab...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav button"));
    const target = btns.find((b) => b.textContent?.includes("Attachments"));
    if (target) (target as HTMLElement).click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "25_complaint_attachments_tab.png") });

  await browser.close();
  console.log("ALL SCREENSHOTS COMPLETED SUCCESSFULLY!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
