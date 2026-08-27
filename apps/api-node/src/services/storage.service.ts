import fs from 'fs';
import path from 'path';

export class StorageService {
  private readonly storageRoot: string;

  constructor() {
    this.storageRoot = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_ROOT || 'storage');
  }

  private getUserStoragePath(clerkUserId: string): string {
    const userPath = path.join(this.storageRoot, 'originals', clerkUserId);
    if (!fs.existsSync(userPath)) {
      fs.mkdirSync(userPath, { recursive: true });
    }
    return userPath;
  }

  public async saveFile(clerkUserId: string, file: Express.Multer.File, documentId: string): Promise<string> {
    const userDir = this.getUserStoragePath(clerkUserId);
    const storedFilename = `${documentId}.pdf`;
    const destPath = path.join(userDir, storedFilename);

    await fs.promises.writeFile(destPath, file.buffer);
    return destPath;
  }

  public getFilePath(clerkUserId: string, documentId: string): string {
    return path.join(this.getUserStoragePath(clerkUserId), `${documentId}.pdf`);
  }

  public async deleteFile(clerkUserId: string, documentId: string): Promise<void> {
    const filePath = this.getFilePath(clerkUserId, documentId);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

export const storageService = new StorageService();
