import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";

for (const key of ["JWT_SECRET", "GOOGLE_CLIENT_ID"]) {
  if (!process.env[key]) throw new Error(`${key} is not set`);
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "user-service", status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

app.listen(process.env.PORT ?? 3001, () => {
  console.log("user-service running");
});
