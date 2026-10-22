
## Getting Started

### 1. Install Dependencies
```bash
cd services/support-service
npm install
```

### 2. Environment Variables (`.env`)
Make sure your `.env` contains:
```env
PORT=3004
DATABASE_URL="postgresql://audit:change_me@localhost:5433/audit_db?schema=public"
ADMIN_EMAIL="auditor@alpa.com"
SUBSCRIPTION_SERVICE_URL="http://localhost:3002"

# Optional: Add your Gmail credentials to receive real emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER="your_email@gmail.com"
SMTP_PASS="your_16_digit_google_app_password"
SMTP_FROM="ALPA Security Support <your_email@gmail.com>"
```

### 3. Sync Database Schema
```bash
npx prisma db push
```

### 4. Run Development Server
```bash
npm run dev
```
The service will start on `http://localhost:3004`.

---

## 📡 API Endpoints

All endpoints are also accessible through the API Gateway at `http://localhost:3000/api/support`.
