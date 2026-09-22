import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../index';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/')) {
        return auth.refreshToken().pipe(
          switchMap((res) => {
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${res.data.accessToken}` },
            });
            return next(retryReq);
          }),
          catchError((refreshError) => {
            auth.logout();
            return throwError(() => refreshError);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
