import axios, { type AxiosInstance } from 'axios';
import { env } from '@/config/env';
import { useAuthStore } from '@/store/authStore';

/**
 * Cliente HTTP centralizado. Inyecta el access token y maneja 401.
 */
export const api: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
