import { Request, Response, NextFunction } from 'express';

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  const reqId = (req as any).id;
  const status = err.status || err.statusCode || 500;
  
  // Do not leak stack traces in production
  const message = (status === 500 && process.env.NODE_ENV === 'production')
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  console.error(`[Error] ReqID: ${reqId} - ${err.message}`, err.stack);

  res.status(status).json({
    error: message,
    requestId: reqId
  });
};
