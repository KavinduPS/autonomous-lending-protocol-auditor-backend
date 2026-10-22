import * as runtime from "@prisma/client/runtime/index-browser";

export type * from "../models.js";
export type * from "./prismaNamespace.js";

export const Decimal = runtime.Decimal;

export const NullTypes = {
  DbNull: runtime.NullTypes.DbNull as new (
    secret: never,
  ) => typeof runtime.DbNull,
  JsonNull: runtime.NullTypes.JsonNull as new (
    secret: never,
  ) => typeof runtime.JsonNull,
  AnyNull: runtime.NullTypes.AnyNull as new (
    secret: never,
  ) => typeof runtime.AnyNull,
};
/**
 * Helper for filtering JSON entries that have `null` on the database (empty on the db)
 *
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
 */
export const DbNull = runtime.DbNull;

/**
 * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
 *
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
 */
export const JsonNull = runtime.JsonNull;

/**
 * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
 *
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
 */
export const AnyNull = runtime.AnyNull;

export const ModelName = {
  SupportTicket: "SupportTicket",
  TicketMessage: "TicketMessage",
} as const;

export type ModelName = (typeof ModelName)[keyof typeof ModelName];

/*
 * Enums
 */

export const TransactionIsolationLevel = runtime.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable",
} as const);

export type TransactionIsolationLevel =
  (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel];

export const SupportTicketScalarFieldEnum = {
  id: "id",
  ticketNumber: "ticketNumber",
  userId: "userId",
  userEmail: "userEmail",
  auditId: "auditId",
  subject: "subject",
  description: "description",
  category: "category",
  priority: "priority",
  status: "status",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

export type SupportTicketScalarFieldEnum =
  (typeof SupportTicketScalarFieldEnum)[keyof typeof SupportTicketScalarFieldEnum];

export const TicketMessageScalarFieldEnum = {
  id: "id",
  ticketId: "ticketId",
  senderRole: "senderRole",
  senderEmail: "senderEmail",
  message: "message",
  createdAt: "createdAt",
} as const;

export type TicketMessageScalarFieldEnum =
  (typeof TicketMessageScalarFieldEnum)[keyof typeof TicketMessageScalarFieldEnum];

export const SortOrder = {
  asc: "asc",
  desc: "desc",
} as const;

export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

export const QueryMode = {
  default: "default",
  insensitive: "insensitive",
} as const;

export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode];

export const NullsOrder = {
  first: "first",
  last: "last",
} as const;

export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder];
