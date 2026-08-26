import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  (req as any).id = reqId; // Expose to other middlewares
  res.setHeader('x-request-id', reqId as string);
  next();
};
