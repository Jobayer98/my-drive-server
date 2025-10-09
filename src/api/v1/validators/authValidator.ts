import { Request, Response, NextFunction } from 'express';
import { ResponseController } from '../../../utils/responseController';

export const validateRegister = (req: Request, res: Response, next: NextFunction) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
     ResponseController.badRequest(res, 'Email, password, and name are required');
     return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
     ResponseController.badRequest(res, 'Invalid email format');
     return;
  }


  if (password.length < 6) {
     ResponseController.badRequest(res, 'Password must be at least 6 characters long');
      return;
  }

  if (name.trim().length < 2) {
     ResponseController.badRequest(res, 'Name must be at least 2 characters long');
     return;
  }

  next();
};

export const validateLogin = (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  if (!email || !password) {
    ResponseController.badRequest(res, 'Email and password are required');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    ResponseController.badRequest(res, 'Invalid email format');
    return;
  }

  next();
};