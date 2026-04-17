import path from "path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    [
      path.resolve(__dirname, "dist/index.js"),
      {
        reportName: process.env.REPORT_NAME,
        reportLink: process.env.LINK,
        reportDesc: process.env.REPORT_DESC,
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        smtpSecure: process.env.SMTP_SECURE,
        smtpUser: process.env.SMTP_USER,
        smtpPass: process.env.SMTP_PASS || process.env.SMTP_PSW,
        from: process.env.FROM,
        to: process.env.TO,
        mailOnSuccess: process.env.MAIL_ON_SUCCESS,
      },
    ],
  ],
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
