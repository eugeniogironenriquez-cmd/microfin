import { Injectable, inject } from "@angular/core";
import {
  HttpClient,
  HttpParams,
  HttpInterceptorFn,
  HttpErrorResponse,
} from "@angular/common/http";
import {
  Observable,
  catchError,
  map,
  throwError,
} from "rxjs";
import {
  Router,
  CanActivateFn,
} from "@angular/router";

import { environment } from "../../environments/environment";
import { ApiResponse } from "./models";
import { AuthService } from "./auth.service";

// ─── API SERVICE ─────────────────────────────────────────────
@Injectable({ providedIn: "root" })
export class ApiService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(
    path: string,
    params?: Record<string, any>,
  ): Observable<T> {
    let httpParams = new HttpParams();

    if (params) {
      Object.keys(params)
        .filter(
          (key) =>
            params[key] != null &&
            params[key] !== "",
        )
        .forEach((key) => {
          httpParams = httpParams.set(
            key,
            String(params[key]),
          );
        });
    }

    return this.http
      .get<ApiResponse<T>>(
        `${this.base}${path}`,
        { params: httpParams },
      )
      .pipe(
        map((response) => this.unwrap(response)),
      );
  }

  post<T>(
    path: string,
    body: any,
  ): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(
        `${this.base}${path}`,
        body,
      )
      .pipe(
        map((response) => this.unwrap(response)),
      );
  }

  put<T>(
    path: string,
    body: any,
  ): Observable<T> {
    return this.http
      .put<ApiResponse<T>>(
        `${this.base}${path}`,
        body,
      )
      .pipe(
        map((response) => this.unwrap(response)),
      );
  }

  /** Descarga binaria: PDF, Excel, etc. */
  getBlob(path: string): Observable<Blob> {
    return this.http.get(
      `${this.base}${path}`,
      {
        responseType: "blob",
      },
    );
  }

  private unwrap<T>(
    response: ApiResponse<T> | T,
  ): T {
    return response &&
      (response as any).data !== undefined
      ? (response as ApiResponse<T>).data
      : (response as T);
  }
}

// ─── AUTH INTERCEPTOR ────────────────────────────────────────
export const authInterceptor: HttpInterceptorFn = (
  req,
  next,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();

  const esLogin = req.url.includes("/auth/login");
  const esRefresh = req.url.includes("/auth/refresh");
  const esLogout = req.url.includes("/auth/logout");

  /*
   * No enviar el access token al login, refresh o logout.
   * Esto evita mandar un token vencido al endpoint de logout.
   */
  const debeAgregarToken =
    Boolean(token) &&
    !esLogin &&
    !esRefresh &&
    !esLogout;

  const authReq = debeAgregarToken
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      /*
       * No ejecutar logout nuevamente si el 401 proviene
       * de un endpoint de autenticación.
       */
      const esEndpointAuth =
        esLogin ||
        esRefresh ||
        esLogout;

      if (
        err.status === 401 &&
        !esEndpointAuth
      ) {
        /*
         * Se usa void porque logout puede devolver Promise.
         * El interceptor no necesita esperar para redirigir.
         */
        void auth.logout();

        void router.navigate(
          ["/login"],
          {
            replaceUrl: true,
          },
        );
      }

      return throwError(() => err);
    }),
  );
};

// ─── AUTH GUARD ──────────────────────────────────────────────
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  void router.navigate(
    ["/login"],
    {
      replaceUrl: true,
    },
  );

  return false;
};

