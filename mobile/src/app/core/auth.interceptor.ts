import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { StorageService } from './storage.service';

/**
 * Adjunta el token Bearer a cada petición.
 * Como el token se guarda en Preferences (async), se resuelve
 * con `from(...)` antes de enviar la petición.
 * No agrega header a las llamadas de /auth/login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const storage = inject(StorageService);

  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
    return next(req);
  }

  return from(storage.getToken()).pipe(
    switchMap((token) => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;
      return next(authReq);
    })
  );
};
