import express from "express";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ service: "api-gateway", status: "ok" });
});

app.listen(3000, () => console.log("api-gateway on 3000"));
