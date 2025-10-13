import Folder, { IFolder } from '../models/Folder';
import logger from '../utils/logger';

export interface FolderListItem {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FolderListResponse {
  folders: FolderListItem[];
  totalCount: number;
}

export class FolderService {
  async listUserFolders(userId: string): Promise<FolderListResponse> {
    try {
      const query = { userId, isDeleted: false } as any;

      const [folders, totalCount] = await Promise.all([
        Folder.find(query).sort({ createdAt: -1 }).lean(),
        Folder.countDocuments(query),
      ]);

      const items: FolderListItem[] = folders.map((f: any) => ({
        id: f._id.toString(),
        name: f.name,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));

      return { folders: items, totalCount };
    } catch (error) {
      logger.error('Error listing user folders:', error);
      throw new Error('Failed to retrieve folders');
    }
  }

  async createFolder(userId: string, name: string): Promise<IFolder> {
    try {
      const existing = await Folder.findOne({ userId, name, isDeleted: false }).lean();
      if (existing) {
        throw new Error('FOLDER_EXISTS');
      }

      const created = await Folder.create({ userId, name });
      return created;
    } catch (error: any) {
      if (error?.message === 'FOLDER_EXISTS') {
        throw error;
      }
      logger.error('Error creating folder:', error);
      throw new Error('Failed to create folder');
    }
  }
}