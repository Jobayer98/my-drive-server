import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../../utils/jwt';
import { ResponseController } from '../../../utils/responseController';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    jti?: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    ResponseController.badRequest(res, 'Access token required');
    return;
  }

  try {
    const decoded = verifyToken(token, process.env.JWT_SECRET!);
    req.user = decoded;
    next();
  } catch (error) {
    ResponseController.badRequest(res, 'Invalid or expired token');
    return;
  }
};