# Production Deployment Guide: Vercel & MongoDB Atlas

This guide documents the production deployment architecture and step-by-step procedures for deploying the ONEPWS Complaint & CAPA Management Portal to Vercel with MongoDB Atlas, Cloudinary, and enterprise SMTP mail services.

---

## 1. Architecture Overview

- **Frontend:** React 18 SPA built with Vite, TypeScript, and Tailwind CSS.
- **Backend API:** Express serverless function routed through `api/index.ts` under the `/api/*` prefix.
- **Static Assets & Routing:** Rewrites in `vercel.json` route `/api/*` requests to the Express serverless function, while routing all other paths to the SPA bundle for client-side HTML5 history routing.
- **File Storage:** Signed Cloudinary uploads with metadata-only persistence in MongoDB. No binary data or large base64 strings are stored in the database.
- **Cron Jobs:** Triggered via Vercel Crons configured in `vercel.json`, secured with `CRON_SECRET` header validation.

---

## 2. MongoDB Atlas Network Access Configuration

Vercel serverless functions run across dynamic IP ranges. To ensure reliable connectivity:
1. In MongoDB Atlas, navigate to **Security** $\rightarrow$ **Network Access**.
2. Add an IP Access List Entry:
   - **Recommended for Enterprise:** Configure AWS PrivateLink / VPC Peering if running on Vercel Enterprise.
   - **Standard Production:** Add `0.0.0.0/0` (Allow Access from Anywhere) combined with strong database user authentication, SCRAM-SHA-256 password hashing, and role-based database privileges limited to the application database.
3. Obtain the connection string in the format:
   ```text
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
   ```

---

## 3. Environment Variables Configuration

Configure the following environment variables in the **Vercel Project Settings** $\rightarrow$ **Environment Variables** (for `Production`, `Preview`, and `Development` environments).

> [!IMPORTANT]
> Never commit actual credential values to GitHub. All placeholders below must be populated with production credentials securely within the Vercel dashboard.

| Variable Name | Required | Description | Example / Default |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | Set environment mode | `production` |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string | `mongodb+srv://...` |
| `JWT_SECRET` | Yes | 64+ character cryptographically random secret | `generated-hex-string` |
| `COOKIE_SECRET` | Yes | 32+ character cookie signing secret | `generated-hex-string` |
| `APP_BASE_URL` | Yes | Public URL of deployed application | `https://portal.onepws.com` |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary account cloud name | `onepws-cloud` |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary REST API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary private secret key | `secret-api-key` |
| `CLOUDINARY_UPLOAD_FOLDER` | No | Target asset folder in Cloudinary | `onepws-complaints` |
| `SMTP_HOST` | Yes | Mail server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | Yes | Mail server port | `587` |
| `SMTP_SECURE` | Yes | Use TLS/SSL (`true` for 465, `false` for 587) | `false` |
| `SMTP_USER` | Yes | SMTP account username / email | `notifications@onepws.com` |
| `SMTP_APP_PASSWORD` | Yes | SMTP application-specific password | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM_EMAIL` | Yes | Outbound sender email address | `notifications@onepws.com` |
| `SMTP_FROM_NAME` | Yes | Outbound sender display name | `ONEPWS Complaint & CAPA Portal` |
| `CRON_SECRET` | Yes | Shared bearer secret for cron endpoints | `high-entropy-random-secret` |

---

## 4. Initial Master Admin Bootstrap

To bootstrap the first Master Admin user into a fresh database:

1. In your local or deployment terminal with the target `MONGODB_URI` configured:
   ```bash
   SEED_ADMIN_NAME="Master Administrator" \
   SEED_ADMIN_USERNAME="masteradmin" \
   SEED_ADMIN_EMAIL="admin@onepws.com" \
   SEED_ADMIN_PASSWORD="StrongSecurePassword123!" \
   npm run seed
   ```
2. The seed script is **completely idempotent**:
   - Seeds all 19 default system permissions.
   - Seeds all 10 default roles.
   - Seeds standard departments, priorities, delay reasons, and root cause categories.
   - Seeds global TAT and multi-tier escalation configurations.
   - Creates the initial Master Admin account if one does not already exist.
   - **Never overwrites** an existing admin's password or credentials.
3. Log in to the web application and change the password immediately under User Settings.

---

## 5. Deployment Verification Checklist

After deploying to Vercel:
1. **Health & Routing:** Navigate to `/api/health` and verify HTTP 200 `{ status: "ok" }`.
2. **SPA History Routing:** Direct reload on `/complaints`, `/capa-tracker`, `/master-data`, `/email-admin` must load the page without 404.
3. **Database Connectivity:** Log in with the Master Admin account created during bootstrap.
4. **Cloudinary Upload:** Create a test complaint and upload an evidence attachment; verify signed URL generation and Cloudinary preview.
5. **SMTP Diagnostics:** In **Governance** $\rightarrow$ **Email Automation** $\rightarrow$ **Settings**, run a test email dispatch to verify SMTP delivery.
6. **Cron Verification:** Send a test POST request to `/api/cron/reminders` with the `Authorization: Bearer <CRON_SECRET>` header to verify cron authentication.
