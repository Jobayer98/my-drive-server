import { Response } from 'express';

interface BaseResponse {
  success: boolean;
  message: string;
}

interface SuccessResponse<T = any> extends BaseResponse {
  data?: T;
}

interface ErrorResponse extends BaseResponse {
  error?: {
    code?: string;
    details?: any;
  };
}

/**
 * Standardized response controller for consistent API responses
 */
export class ResponseController {
  /**
   * OK (200): Standard success response
   */
  static ok<T>(res: Response, message: string = 'Success', data?: T): Response {
    const response: SuccessResponse<T> = {
      success: true,
      message,
      ...(data && { data })
    };
    return res.status(200).json(response);
  }

  /**
   * Created (201): Resource creation success response
   */
  static created<T>(res: Response, message: string = 'Resource created successfully', data?: T): Response {
    const response: SuccessResponse<T> = {
      success: true,
      message,
      ...(data && { data })
    };
    return res.status(201).json(response);
  }

  /**
   * Bad Request (400): Client-side error with validation details
   */
  static badRequest(res: Response, message: string = 'Bad request', details?: any): Response {
    const response: ErrorResponse = {
      success: false,
      message,
      ...(details && { error: { details } })
    };
    return res.status(400).json(response);
  }

  /**
   * Internal Server Error (500): Server-side error response
   */
  static serverError(res: Response, message: string = 'Internal server error', error?: any): Response {
    const response: ErrorResponse = {
      success: false,
      message,
      ...(error && { error: { code: 'INTERNAL_ERROR', details: error } })
    };
    return res.status(500).json(response);
  }

  /**
   * Conflict (409): Resource conflict error
   */
  static conflict(res: Response, message: string = 'Resource conflict'): Response {
    const response: ErrorResponse = {
      success: false,
      message,
    };
    return res.status(409).json(response);
  }
}