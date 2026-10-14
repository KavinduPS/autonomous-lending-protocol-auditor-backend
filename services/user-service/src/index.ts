import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.routes";

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

app.listen(process.env.PORT ?? 3001, () => {
  console.log("user-service running");
});
