import { Request, Response, NextFunction } from "express";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Cannot ${req.method} ${req.originalUrl} - Route not found on API Gateway`,
    },
    requestId: (req as any).id,
  });
}

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.status || err.statusCode || 500;
  console.error(
    `[API-GATEWAY ERROR] [${(req as any).id}] ${err.message}`,
    err.stack,
  );

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred in API Gateway",
    },
    requestId: (req as any).id,
  });
}
