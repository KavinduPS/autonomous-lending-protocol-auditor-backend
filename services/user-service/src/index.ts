import express from "express";
const app = express();
const port = Number(process.env.PORT) || 3001;
app.get("/health", (_req, res) => {
res.json({ service: "user-service", status: "ok" });
});
app.listen(port, () => console.log(`user-service on ${port}`));