import { clerkMiddleware, requireAuth } from '@clerk/express';

// Export the base clerk middleware
export const authMiddleware = clerkMiddleware();

// Export the stricter middleware that requires authentication
export const requireAuthentication = requireAuth();
