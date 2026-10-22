import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 3004,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://audit:change_me@localhost:5432/audit_db?schema=public",
  adminEmail: process.env.ADMIN_EMAIL || "auditor@alpa.com",
  subscriptionServiceUrl:
    process.env.SUBSCRIPTION_SERVICE_URL || "http://localhost:3002",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from:
      process.env.SMTP_FROM ||
      '"ALPA Security Support" <support@alpa-security.com>',
  },
};
