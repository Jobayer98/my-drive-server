import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../../utils/jwt';
import { ResponseController } from '../../../utils/responseController';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return ResponseController.badRequest(res, 'Access token required');
  }

  try {
    const decoded = verifyToken(token, process.env.JWT_SECRET!);
    req.user = decoded;
    next();
  } catch (error) {
    return ResponseController.badRequest(res, 'Invalid or expired token');
  }
};