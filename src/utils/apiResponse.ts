import { Response } from 'express';

export interface IApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export const sendResponse = <T>(res: Response, responseData: IApiResponse<T>): Response => {
  return res.status(responseData.statusCode).json({
    success: responseData.success,
    statusCode: responseData.statusCode,
    message: responseData.message,
    data: responseData.data,
    meta: responseData.meta,
  });
};

export class ApiResponse {
  static success<T>(res: Response, statusCode: number = 200, message: string = 'Success', data?: T, meta?: any): Response {
    return sendResponse(res, { success: true, statusCode, message, data, meta });
  }

  static error(res: Response, statusCode: number = 400, message: string = 'Error', data?: any): Response {
    return sendResponse(res, { success: false, statusCode, message, data });
  }
}
