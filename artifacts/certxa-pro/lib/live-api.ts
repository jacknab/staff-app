import {
  CertxaApiError,
  certxaRequest,
  clearSession,
  getStoredToken,
} from './certxa-api';

export { CertxaApiError as ApiError };

async function authenticatedRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = await getStoredToken();
  if (!token) throw new CertxaApiError('Your Certxa session has expired. Please sign in again.', 401);

  try {
    return await certxaRequest<T>(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    }, token);
  } catch (error) {
    if (error instanceof CertxaApiError && error.status === 401) await clearSession();
    throw error;
  }
}

export const api = {
  get: <T = unknown>(path: string) => authenticatedRequest<T>(path, 'GET'),
  post: <T = unknown>(path: string, body?: unknown) => authenticatedRequest<T>(path, 'POST', body),
  put: <T = unknown>(path: string, body?: unknown) => authenticatedRequest<T>(path, 'PUT', body),
  patch: <T = unknown>(path: string, body?: unknown) => authenticatedRequest<T>(path, 'PATCH', body),
  del: <T = unknown>(path: string) => authenticatedRequest<T>(path, 'DELETE'),
};
