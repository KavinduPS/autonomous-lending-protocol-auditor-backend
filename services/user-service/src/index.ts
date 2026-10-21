import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ service: "user-service", status: "ok" });
});

app.use("/api/auth", authRoutes);

app.listen(process.env.PORT ?? 3001, () => {
  console.log("user-service running");
});
