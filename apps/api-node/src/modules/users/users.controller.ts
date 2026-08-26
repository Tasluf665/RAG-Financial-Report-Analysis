import { Request, Response } from 'express';
import { User } from './user.model';
import { clerkClient } from '@clerk/express';

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    // req.auth is provided by Clerk's requireAuth middleware
    const clerkUserId = (req as any).auth?.userId;

    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Try to find the user in MongoDB
    let user = await User.findOne({ clerkUserId });

    if (!user) {
      // Fetch user details from Clerk if not in MongoDB
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const email = clerkUser.emailAddresses[0]?.emailAddress || '';
      const displayName = clerkUser.firstName 
        ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() 
        : 'User';

      // Create the user in MongoDB
      user = await User.create({
        clerkUserId,
        email,
        displayName
      });
    }

    res.json({
      status: 'success',
      data: user
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth?.userId;
    if (!clerkUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await User.findOne({ clerkUserId });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // Merge new settings with existing settings
    const currentSettings = user.settings ? ((user.settings as any).toObject ? (user.settings as any).toObject() : user.settings) : {};
    user.settings = { ...currentSettings, ...req.body };
    await user.save();

    res.json({ status: 'success', data: user.settings });
  } catch (error) {
    console.error('Error in updateSettings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
