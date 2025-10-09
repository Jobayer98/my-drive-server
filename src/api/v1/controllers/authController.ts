import { Request, Response } from 'express';
import { AuthService } from '../../../services/authService';
import { ResponseController } from '../../../utils/responseController';
import logger from '../../../utils/logger';

const authService = new AuthService();

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    
    const result = await authService.register({ email, password, name });
    
    logger.info(`User registered successfully: ${email}`);
    
    return ResponseController.created(res, 'User registered successfully', result);
  } catch (error) {
    logger.error('Registration error:', error);
    
    if (error instanceof Error && error.message === 'User already exists') {
      return ResponseController.conflict(res, 'User already exists');
    }
    
    return ResponseController.serverError(res, 'Registration failed');
  }
};