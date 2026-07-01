import { Injectable, inject } from '@angular/core';
import {
  HttpClient, HttpParams, HttpInterceptorFn, HttpErrorResponse,
} from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { CanActivateFn } from '@angular/router';
import { environment } from '../../environments/environment';
import { ApiResponse } from './models';
import { AuthService } from './auth.service';

// ─── API SERVICE ─────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(path: string, params?: Record<string, any>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params)
        .filter((k) => params[k] != null && params[k] !== '')
        .forEach((k) => { httpParams = httpParams.set(k, String(params[k])); });
    }
    return this.http.get<ApiResponse<T>>(`${this.base}${path}`, { params: httpParams })
      .pipe(map((r) => this.unwrap(r)));
  }

  post<T>(path: string, body: any): Observable<T> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((r) => this.unwrap(r)));
  }

  put<T>(path: string, body: any): Observable<T> {
    return this.http.put<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((r) => this.unwrap(r)));
  }

  private unwrap<T>(res: ApiResponse<T> | T): T {
    return res && (res as any).data !== undefined ? (res as ApiResponse<T>).data : (res as T);
  }
}

// ─── AUTH INTERCEPTOR ────────────────────────────────────────
// Agrega el token a cada petición y redirige a login si expira (401).
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};

// ─── AUTH GUARD ──────────────────────────────────────────────
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};
