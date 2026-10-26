import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { checkTicketQuota } from "../services/quota.service.js";
import {
  sendAdminTicketAlert,
  processInboundEmailReply,
} from "../services/mail.service.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getTicketWhereClause(idOrNumber: string) {
  if (UUID_REGEX.test(idOrNumber)) {
    return { id: idOrNumber };
  }
  return { ticketNumber: idOrNumber.toUpperCase() };
}

const CreateTicketSchema = z.object({
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  category: z
    .enum(["AUDIT_DISPUTE", "EXECUTION_BUG", "GENERAL"])
    .default("GENERAL"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  auditId: z.string().optional().nullable(),
});

const AddMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});

const UpdateStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
});

const InboundEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  from: z.string().optional(),
});

export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req.headers["x-user-id"] as string) || req.body.userId;
    const userEmail =
      (req.headers["x-user-email"] as string) ||
      req.body.userEmail ||
      "user@alpa.com";

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Unauthorized: Missing user identification",
      });
      return;
    }

    const validation = CreateTicketSchema.safeParse(req.body);
    if (!validation.success) {
      res
        .status(400)
        .json({ success: false, errors: validation.error.format() });
      return;
    }

    const { subject, description, category, priority, auditId } =
      validation.data;

    const quota = await checkTicketQuota(userId);
    if (!quota.allowed) {
      res.status(403).json({
        success: false,
        error: "QUOTA_EXCEEDED",
        message: `You have reached your limit of ${quota.maxAllowed} support tickets for your ${quota.planCode} plan. Please upgrade your subscription tier for additional tickets.`,
        currentCount: quota.currentCount,
        maxAllowed: quota.maxAllowed,
        planCode: quota.planCode,
      });
      return;
    }

    const count = await prisma.supportTicket.count();
    const ticketNumber = `TICK-${1000 + count + 1}`;

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        userId,
        userEmail,
        auditId: auditId || null,
        subject,
        description,
        category,
        priority,
        status: "OPEN",
        messages: {
          create: {
            senderRole: "USER",
            senderEmail: userEmail,
            message: description,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    sendAdminTicketAlert({
      ticketNumber,
      userEmail,
      auditId,
      category,
      subject,
      description,
    }).catch((err) => console.error("[TicketController] Alert error:", err));

    res.status(201).json({
      success: true,
      data: ticket,
      message: `Support Ticket ${ticketNumber} created successfully. Our security auditors have been alerted.`,
    });
  } catch (error: any) {
    console.error("[TicketController] Create error:", error);
    res
      .status(500)
      .json({ success: false, error: "Internal server error creating ticket" });
  }
}

export async function getTickets(req: Request, res: Response): Promise<void> {
  try {
    const userId =
      (req.headers["x-user-id"] as string) || (req.query.userId as string);
    const userRole = (req.headers["x-user-role"] as string) || "";

    const isAuditor =
      userRole.toUpperCase() === "ADMIN" ||
      userRole.toUpperCase() === "AUDITOR";

    const whereClause = isAuditor && !userId ? {} : { userId };

    const tickets = await prisma.supportTicket.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    res.json({ success: true, count: tickets.length, data: tickets });
  } catch (error: any) {
    console.error("[TicketController] GetTickets error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error fetching tickets",
    });
  }
}

export async function getTicketById(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    const userId =
      (req.headers["x-user-id"] as string) || (req.query.userId as string);
    const userRole = (req.headers["x-user-role"] as string) || "";
    const isAuditor =
      userRole.toUpperCase() === "ADMIN" ||
      userRole.toUpperCase() === "AUDITOR";

    const ticket = await prisma.supportTicket.findFirst({
      where: getTicketWhereClause(id),
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }

    if (userId && ticket.userId !== userId && !isAuditor) {
      res.status(403).json({
        success: false,
        error: "Forbidden: You are not authorized to view this ticket",
      });
      return;
    }

    res.json({ success: true, data: ticket });
  } catch (error: any) {
    console.error("[TicketController] GetTicketById error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error fetching ticket details",
    });
  }
}

export async function addMessage(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = (req.headers["x-user-id"] as string) || req.body.userId;
    const userEmail =
      (req.headers["x-user-email"] as string) || req.body.userEmail;
    const userRole =
      (req.headers["x-user-role"] as string) || req.body.userRole || "";
    const isAuditor =
      userRole.toUpperCase() === "ADMIN" ||
      userRole.toUpperCase() === "AUDITOR";

    const validation = AddMessageSchema.safeParse(req.body);
    if (!validation.success) {
      res
        .status(400)
        .json({ success: false, errors: validation.error.format() });
      return;
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: getTicketWhereClause(id),
    });

    if (!ticket) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }

    if (userId && ticket.userId !== userId && !isAuditor) {
      res.status(403).json({
        success: false,
        error: "Forbidden: You cannot reply to this ticket",
      });
      return;
    }

    const senderRole = isAuditor ? "AUDITOR" : "USER";

    const newMessage = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderRole,
        senderEmail: userEmail,
        message: validation.data.message,
      },
    });

    let updatedStatus = validation.data.status;
    if (!updatedStatus && isAuditor) {
      updatedStatus = "RESOLVED";
    }

    let updatedTicket = ticket;
    if (updatedStatus && updatedStatus !== ticket.status) {
      updatedTicket = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: updatedStatus },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        message: newMessage,
        ticketStatus: updatedTicket.status,
      },
    });
  } catch (error: any) {
    console.error("[TicketController] AddMessage error:", error);
    res
      .status(500)
      .json({ success: false, error: "Internal server error adding message" });
  }
}

export async function updateTicketStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    const validation = UpdateStatusSchema.safeParse(req.body);
    if (!validation.success) {
      res
        .status(400)
        .json({ success: false, errors: validation.error.format() });
      return;
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: getTicketWhereClause(id),
    });

    if (!ticket) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: validation.data.status },
    });

    res.json({
      success: true,
      data: updated,
      message: `Ticket status updated to ${updated.status}`,
    });
  } catch (error: any) {
    console.error("[TicketController] UpdateStatus error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error updating ticket status",
    });
  }
}

export async function deleteTicket(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const ticket = await prisma.supportTicket.findFirst({
      where: getTicketWhereClause(id),
    });

    if (!ticket) {
      res.status(404).json({ success: false, error: "Ticket not found" });
      return;
    }

    await prisma.supportTicket.delete({
      where: { id: ticket.id },
    });

    res.json({
      success: true,
      message: `Ticket ${ticket.ticketNumber} deleted successfully`,
    });
  } catch (error: any) {
    console.error("[TicketController] DeleteTicket error:", error);
    res
      .status(500)
      .json({ success: false, error: "Internal server error deleting ticket" });
  }
}

export async function handleInboundEmail(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const validation = InboundEmailSchema.safeParse(req.body);
    if (!validation.success) {
      res
        .status(400)
        .json({ success: false, errors: validation.error.format() });
      return;
    }

    const { subject, body, from } = validation.data;
    const result = await processInboundEmailReply(subject, body, from);

    res.json({
      success: true,
      message: `Successfully processed reply from ${from || "email"}. Ticket ${result.ticket.ticketNumber} status set to RESOLVED.`,
      data: result,
    });
  } catch (error: any) {
    console.error("[TicketController] InboundEmail error:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Failed to process inbound email",
    });
  }
}
