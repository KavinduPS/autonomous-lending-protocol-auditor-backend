import { prisma } from "../config/database.js";

export interface CreatePlanInput {
  code: string;
  stripePriceId: string | null;
  priceMinor: bigint;
  currency: string;
  creditsPerPeriod: number;
  exploitSimulation: boolean;
  extraCreditsAllowed: boolean;
  maxConcurrentAudits: number;
  queuePriority: string;
  apiAccess: boolean;
  isActive: boolean;
}

export interface UpdatePlanInput {
  code?: string;
  stripePriceId?: string | null;
  priceMinor?: bigint;
  currency?: string;
  creditsPerPeriod?: number;
  exploitSimulation?: boolean;
  extraCreditsAllowed?: boolean;
  maxConcurrentAudits?: number;
  queuePriority?: string;
  apiAccess?: boolean;
  isActive?: boolean;
}

async function findAll() {
  return prisma.plan.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      priceMinor: "asc",
    },
  });
}

async function findById(id: string) {
  return prisma.plan.findUnique({
    where: {
      id,
    },
  });
}

async function findByCode(code: string) {
  return prisma.plan.findUnique({
    where: {
      code: code.trim().toUpperCase(),
    },
  });
}

async function create(data: CreatePlanInput) {
  return prisma.plan.create({
    data: {
      code: data.code.trim().toUpperCase(),
      stripePriceId: data.stripePriceId,
      priceMinor: data.priceMinor,
      currency: data.currency.toLowerCase(),
      creditsPerPeriod: data.creditsPerPeriod,
      exploitSimulation: data.exploitSimulation,
      extraCreditsAllowed: data.extraCreditsAllowed,
      maxConcurrentAudits: data.maxConcurrentAudits,
      queuePriority: data.queuePriority.toUpperCase(),
      apiAccess: data.apiAccess,
      isActive: data.isActive,
    },
  });
}

async function update(id: string, data: UpdatePlanInput) {
  return prisma.plan.update({
    where: {
      id,
    },
    data,
  });
}

async function remove(id: string) {
  return prisma.plan.delete({
    where: {
      id,
    },
  });
}

export const planService = {
  findAll,
  findById,
  findByCode,
  create,
  update,
  remove,
};
