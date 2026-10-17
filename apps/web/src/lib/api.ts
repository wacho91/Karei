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
  // FIX: en el store el campo se llama "token" (no "accessToken").
  const token = useAuthStore.getState().token;
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
      // Si el token murió a mitad de sesión, mandamos al login.
      // El guard evita bucle cuando ya estamos en /login (credenciales malas también dan 401).
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);