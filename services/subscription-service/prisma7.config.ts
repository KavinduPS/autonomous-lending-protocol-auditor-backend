import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/planSeed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
