import Folder, { IFolder } from '../models/Folder';
import logger from '../utils/logger';

type IFolderLean = Pick<
  IFolder,
  '_id' | 'userId' | 'name' | 'isDeleted' | 'parentId' | 'createdAt' | 'updatedAt'
>;

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

export interface FolderDoc extends IFolder {}

export class FolderService {
  async listUserFolders(
    userId: string,
    parentId?: string | null
  ): Promise<FolderListResponse> {
    try {
      const query: any = { userId, isDeleted: false };
      if (typeof parentId !== 'undefined') {
        query.parentId = parentId ? parentId : null;
      }

      const folders: IFolderLean[] = (await Folder.find(query)
        .sort({ createdAt: -1 })
        .lean<IFolderLean>()
        .exec()) as unknown as IFolderLean[];
      const totalCount: number = await Folder.countDocuments(query).exec();

      const items: FolderListItem[] = folders.map((f: IFolderLean) => ({
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

  async getFolderById(
    userId: string,
    folderId: string
  ): Promise<IFolderLean | null> {
    try {
      const doc = (await Folder.findOne({
        _id: folderId,
        userId,
        isDeleted: false,
      }).lean<IFolderLean>().exec()) as unknown as IFolderLean | null;
      return doc;
    } catch (error) {
      logger.error('Error getting folder by id:', error);
      throw new Error('Failed to get folder');
    }
  }

  async getFolderPathSegments(
    userId: string,
    parentId?: string | null
  ): Promise<string[]> {
    if (!parentId) return [];
    const segments: string[] = [];
    let currentId: string | null = parentId || null;
    const safetyLimit = 50; // prevent infinite loops
    let counter = 0;
    while (currentId && counter < safetyLimit) {
      const f = (await Folder.findOne({
        _id: currentId,
        userId,
        isDeleted: false,
      }).lean<IFolderLean>().exec()) as unknown as IFolderLean | null;
      if (!f) break;
      segments.push(f.name);
      currentId = f.parentId ? f.parentId.toString() : null;
      counter++;
    }
    return segments.reverse();
  }

  async createFolder(
    userId: string,
    name: string,
    parentId?: string | null
  ): Promise<IFolder> {
    try {
      const query: any = {
        userId,
        name,
        isDeleted: false,
        parentId: parentId ? parentId : null,
      };
      const existing = (await Folder.findOne(query).lean<IFolderLean>().exec()) as unknown as IFolderLean | null;
      if (existing) {
        throw new Error('FOLDER_EXISTS');
      }

      const created = await Folder.create({
        userId,
        name,
        parentId: parentId ? parentId : null,
      });
      return created as IFolder;
    } catch (error: any) {
      if (error?.message === 'FOLDER_EXISTS') {
        throw error;
      }
      logger.error('Error creating folder:', error);
      throw new Error('Failed to create folder');
    }
  }
}
