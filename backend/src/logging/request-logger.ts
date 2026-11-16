import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const logger = new Logger("HTTP");

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();
  res.on("close", () => {
    logger.log({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - start),
      aborted: !res.writableFinished,
    });
  });
  next();
}
