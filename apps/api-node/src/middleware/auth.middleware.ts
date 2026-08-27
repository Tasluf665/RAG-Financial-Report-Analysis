import { clerkMiddleware, getAuth } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';

// Export the base clerk middleware
export const authMiddleware = clerkMiddleware();

// Custom middleware that requires authentication
export const requireAuthentication = (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    // Attach auth to request for controllers
    (req as any).auth = auth;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};
