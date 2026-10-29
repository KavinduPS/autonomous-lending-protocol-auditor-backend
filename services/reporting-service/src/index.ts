import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import reportRoutes from "./routes/report.routes.js";
import ingestRoutes from "./routes/ingest.routes.js";

const app = express();

const port = Number(process.env.PORT) || 3003;

// Sandbox traces can be large, the default limit is 100 kb.
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({
    service: "reporting-service",
    status: "ok",
  });
});

app.use("/internal", ingestRoutes);
app.use("/api/reports", reportRoutes);

// Body-parser errors (bad JSON, body too large) would otherwise return HTML.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON body" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({ message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`reporting-service on ${port}`);
});
