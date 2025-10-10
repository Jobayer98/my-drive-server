import { Request, Response } from 'express';
import { AuthService } from '../../../services/authService';
import { ResponseController } from '../../../utils/responseController';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import logger from '../../../utils/logger';

const authService = new AuthService();

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    const result = await authService.register({ email, password, name });

    logger.info(`User registered successfully: ${email}`);

    return ResponseController.created(
      res,
      'User registered successfully',
      result
    );
  } catch (error) {
    logger.error('Registration error:', error);

    if (error instanceof Error && error.message === 'User already exists') {
      return ResponseController.conflict(res, 'User already exists');
    }

    return ResponseController.serverError(res, 'Registration failed');
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await authService.login({ email, password });

    logger.info(`User logged in successfully: ${email}`);

    return ResponseController.ok(res, 'Login successful', result);
  } catch (error) {
    logger.error('Login error:', error);

    if (error instanceof Error && error.message === 'Invalid credentials') {
      return ResponseController.unauthorized(res, 'Invalid credentials');
    }

    return ResponseController.serverError(res, 'Login failed');
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await authService.logout(req.user!.userId);

    logger.info(`User logged out successfully: ${req.user!.email}`);

    return ResponseController.ok(res, 'Logout successful');
  } catch (error) {
    logger.error('Logout error:', error);

    return ResponseController.serverError(res, 'Logout failed');
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return ResponseController.badRequest(res, 'Refresh token is required');
    }

    const result = await authService.refreshToken(refreshToken);

    logger.info(`Token refreshed successfully for user: ${result.user.email}`);

    return ResponseController.ok(res, 'Token refreshed successfully', result);
  } catch (error) {
    logger.error('Token refresh error:', error);

    if (error instanceof Error) {
      switch (error.message) {
        case 'Invalid or expired refresh token':
        case 'Token has been revoked':
          return ResponseController.badRequest(res, error.message);
        case 'User not found':
          return ResponseController.badRequest(res, 'Invalid refresh token');
        default:
          return ResponseController.serverError(res, 'Token refresh failed');
      }
    }

    return ResponseController.serverError(res, 'Token refresh failed');
  }
};
