import {
  createProxyMiddleware,
  fixRequestBody,
  Options,
} from "http-proxy-middleware";
import { Request, Response } from "express";

export interface ProxyFactoryOptions {
  target: string;
  pathRewrite?: Options["pathRewrite"];
  timeoutMs?: number;
  customOptions?: Partial<Options>;
}

export function createServiceProxy({
  target,
  pathRewrite,
  timeoutMs = 60000,
  customOptions = {},
}: ProxyFactoryOptions) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    timeout: timeoutMs,
    proxyTimeout: timeoutMs,
    pathRewrite: pathRewrite ?? ((path, req: any) => req.originalUrl || path),
    on: {
      proxyReq: (proxyReq, req: any, _res) => {
        if (req.id) {
          proxyReq.setHeader("x-request-id", req.id);
        }

        if (req.user) {
          if (req.user.userId) proxyReq.setHeader("x-user-id", req.user.userId);
          if (req.user.role) proxyReq.setHeader("x-user-role", req.user.role);
          if (req.user.email)
            proxyReq.setHeader("x-user-email", req.user.email);
        }

        fixRequestBody(proxyReq, req);
      },
      error: (err: any, req: any, res: any) => {
        console.error(
          `[PROXY ERROR] [${req?.id}] Failed connecting to ${target}: ${err.message}`,
        );

        if (res && !res.headersSent) {
          res.status(503).json({
            success: false,
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: `Downstream service (${target}) is unreachable or timed out.`,
              details: err.message,
            },
            requestId: req?.id,
          });
        }
      },
    },
    ...customOptions,
  });
}
