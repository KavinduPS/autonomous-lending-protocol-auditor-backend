import { prisma } from "../config/database.js";
import { config } from "../config/env.js";

const PLAN_LIMITS: Record<string, number> = {
  FREE: 2,
  STARTER: 2,
  PRO: 5,
  DEVELOPER: 5,
  ENTERPRISE: 20,
};

export async function getUserPlan(userId: string): Promise<string> {
  try {
    const res = await fetch(
      `${config.subscriptionServiceUrl}/api/subscriptions/user/${userId}`,
      { headers: { "Content-Type": "application/json" } },
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.plan?.code) {
        return String(data.plan.code).toUpperCase();
      }
    }
  } catch {}
  return "FREE";
}

export async function checkTicketQuota(userId: string) {
  const planCode = await getUserPlan(userId);
  const maxAllowed = PLAN_LIMITS[planCode] ?? 2;

  const currentCount = await prisma.supportTicket.count({
    where: { userId },
  });

  return {
    allowed: currentCount < maxAllowed,
    currentCount,
    maxAllowed,
    planCode,
  };
}
