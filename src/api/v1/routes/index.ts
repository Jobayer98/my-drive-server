import { Router } from 'express';
import authRoutes from './authRoutes';
import fileRoutes from './fileRoutes';
import folderRoutes from './folderRoutes';
import shareRoutes from './shareRoutes';
import s3Routes from './s3Routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/files', fileRoutes);
router.use('/folders', folderRoutes);
router.use('/share', shareRoutes);
router.use('/s3', s3Routes);

export default router;