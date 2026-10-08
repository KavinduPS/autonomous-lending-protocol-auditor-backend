"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
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
