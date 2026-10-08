import express from "express";
const app = express();
const port = Number(process.env.PORT) || 3002;
app.get("/health", (_req, res) => {
res.json({ service: "subscription-service", status: "ok" });
});
app.listen(port, () => console.log(`subscription-service on ${port}`));