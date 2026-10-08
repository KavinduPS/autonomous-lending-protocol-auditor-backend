import express from "express";

const app = express();

const port = Number(process.env.PORT) || 3003;

app.get("/health", (_req, res) => {
  res.json({
    service: "reporting-service",
    status: "ok",
  });
});

app.listen(port, () => {
  console.log(`reporting-service on ${port}`);
});
