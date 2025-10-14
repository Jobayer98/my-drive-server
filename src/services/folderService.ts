import Folder, { IFolder } from '../models/Folder';
import logger from '../utils/logger';

type IFolderLean = Pick<
  IFolder,
  | '_id'
  | 'userId'
  | 'name'
  | 'isDeleted'
  | 'parentId'
  | 'createdAt'
  | 'updatedAt'
>;

export interface FolderListItem {
  id: string;
  name: string;
  parentId?: string | null;
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
        parentId: f.parentId ? f.parentId.toString() : null,
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
      })
        .lean<IFolderLean>()
        .exec()) as unknown as IFolderLean | null;
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
      })
        .lean<IFolderLean>()
        .exec()) as unknown as IFolderLean | null;
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
      const existing = (await Folder.findOne(query)
        .lean<IFolderLean>()
        .exec()) as unknown as IFolderLean | null;
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

  async renameFolder(
    userId: string,
    folderId: string,
    newName: string
  ): Promise<IFolderLean | null> {
    try {
      const current = await Folder.findOne({
        _id: folderId,
        userId,
        isDeleted: false,
      })
        .lean<IFolderLean>()
        .exec();
      if (!current) return null;

      const conflict = await Folder.findOne({
        userId,
        parentId: current.parentId ?? null,
        name: newName,
        isDeleted: false,
      })
        .lean<IFolderLean>()
        .exec();
      if (conflict) {
        const err: any = new Error('FOLDER_EXISTS');
        throw err;
      }

      const updated = await Folder.findOneAndUpdate(
        { _id: folderId, userId, isDeleted: false },
        { $set: { name: newName } },
        { new: true }
      )
        .lean<IFolderLean>()
        .exec();
      return updated;
    } catch (error) {
      if ((error as any)?.message === 'FOLDER_EXISTS') throw error;
      logger.error('Error renaming folder:', error);
      throw new Error('Failed to rename folder');
    }
  }

  async softDeleteFolderTree(
    userId: string,
    folderId: string
  ): Promise<{ deletedCount: number }> {
    try {
      const root = await Folder.findOne({
        _id: folderId,
        userId,
        isDeleted: false,
      })
        .lean<IFolderLean>()
        .exec();
      if (!root) return { deletedCount: 0 };

      const toDeleteIds: string[] = [folderId];
      const queue: string[] = [folderId];

      while (queue.length) {
        const parent = queue.shift()!;
        const children = await Folder.find({
          userId,
          parentId: parent,
          isDeleted: false,
        })
          .select({ _id: 1 })
          .lean()
          .exec();
        for (const ch of children as any[]) {
          const id = ch._id.toString();
          toDeleteIds.push(id);
          queue.push(id);
        }
      }

      const res = await Folder.updateMany(
        { _id: { $in: toDeleteIds } },
        { $set: { isDeleted: true } }
      );
      return { deletedCount: res.modifiedCount || 0 };
    } catch (error) {
      logger.error('Error soft-deleting folder tree:', error);
      throw new Error('Failed to delete folder');
    }
  }
}
