import express from "express";
import reportRoutes from "./routes/report.routes.js";

const app = express();

const port = Number(process.env.PORT) || 3003;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    service: "reporting-service",
    status: "ok",
  });
});

app.use("/api/reports", reportRoutes);

app.listen(port, () => {
  console.log(`reporting-service on ${port}`);
});
