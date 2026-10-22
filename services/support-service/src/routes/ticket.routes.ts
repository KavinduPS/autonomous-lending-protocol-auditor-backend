import { Router } from "express";
import {
  createTicket,
  getTickets,
  getTicketById,
  addMessage,
  updateTicketStatus,
  deleteTicket,
  handleInboundEmail,
} from "../controllers/ticket.controller.js";

const router = Router();

router.post("/inbound-email", handleInboundEmail);

router.post("/tickets", createTicket);
router.get("/tickets", getTickets);
router.get("/tickets/:id", getTicketById);
router.post("/tickets/:id/messages", addMessage);
router.patch("/tickets/:id/status", updateTicketStatus);
router.delete("/tickets/:id", deleteTicket);

export default router;
