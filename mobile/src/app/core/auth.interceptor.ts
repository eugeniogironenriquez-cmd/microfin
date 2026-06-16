import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { from, switchMap, catchError, throwError } from 'rxjs';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';

/**
 * Adjunta el token Bearer a cada petición y renueva el token
 * automáticamente ante un 401 (token expirado).
 *
 * Flujo:
 *  1. Adjunta el access token guardado (async desde Preferences).
 *  2. Si la respuesta es 401 (y no es una ruta de /auth), intenta
 *     renovar el token con refreshToken() y reintenta la petición.
 *  3. Si el refresh falla (sin conexión, refresh expirado), propaga
 *     el error original. Sin conexión los pagos se guardan offline igual.
 *
 * No intercepta /auth/login ni /auth/refresh (evita bucles).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const storage = inject(StorageService);
  const auth = inject(AuthService);

  const isAuthRoute = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');
  if (isAuthRoute) {
    return next(req);
  }

  return from(storage.getToken()).pipe(
    switchMap((token) => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

      return next(authReq).pipe(
        catchError((err: HttpErrorResponse) => {
          // Solo intentamos renovar ante un 401 (token expirado/ inválido)
          if (err.status !== 401) {
            return throwError(() => err);
          }
          // Intentar renovar el token y reintentar la petición original
          return from(auth.refreshToken()).pipe(
            switchMap((newToken) => {
              if (!newToken) {
                // No se pudo renovar (sin conexión o refresh expirado)
                return throwError(() => err);
              }
              const retryReq = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
              return next(retryReq);
            })
          );
        })
      );
    })
  );
};
