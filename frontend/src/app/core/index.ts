import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// ─── MODELS ──────────────────────────────────────────────────
export interface User {
  id: string; email: string; name: string; role: UserRole;
}
export type UserRole = 'ADMIN' | 'CAJERO' | 'AUTORIZADOR' | 'COBRADOR';
export type LoanStatus = 'SOLICITUD' | 'AUTORIZADO' | 'RECHAZADO' | 'ACTIVO' | 'VENCIDO' | 'REESTRUCTURADO' | 'LIQUIDADO' | 'CASTIGADO';

export interface Customer {
  id: string; curp: string; rfc?: string; fullName: string;
  phone: string; email?: string; birthDate?: string;
  address?: Address; status: string; monthlyIncome?: number;
  createdAt: string; loans?: Loan[];
}
export interface Address {
  street: string; colonia: string; municipality: string;
  state: string; zip: string; references?: string;
}
export interface LoanType {
  id: string; name: string; defaultRate: number; minRate: number; maxRate: number;
  minAmount: number; maxAmount: number; minTermWeeks: number; maxTermWeeks: number;
  frequency: string; lateFeeFactor: number; graceDays: number; isActive?: boolean;
}
export interface Loan {
  id: string; customerId: string; customer?: Customer;
  loanTypeId: string; loanType?: LoanType;
  parentLoanId?: string; principalAmount: number; interestRate: number;
  termWeeks: number; frequency: string; status: LoanStatus;
  totalAmount?: number; periodicPayment?: number;
  authorizedBy?: string; authorizedAt?: string; rejectionReason?: string;
  disbursedAt?: string; disbursementMethod?: string;
  restructureReason?: string; restructureCount: number;
  collectorId?: string; notes?: string;
  paymentSchedules?: PaymentSchedule[]; payments?: Payment[];
  createdAt: string;
}
export interface PaymentSchedule {
  id: string; loanId: string; periodNumber: number; dueDate: string;
  principalDue: number; interestDue: number; totalDue: number;
  balanceDue: number; lateInterest: number; status: string; paidAt?: string;
  daysOverdue?: number; estimatedLateInterest?: number;
}
export interface Payment {
  id: string; loanId: string; collectorId?: string; amountPaid: number;
  capitalApplied: number; interestApplied: number; lateInterestApplied: number;
  paymentDate: string; method: string; source: string;
  reference?: string; notes?: string; createdBy: string; createdAt: string;
}
export interface ApiResponse<T> { success: boolean; data: T; timestamp: string; }
export interface PagedResponse<T> { data: T[]; total: number; page: number; limit: number; pages: number; }

// ─── AUTH SERVICE ────────────────────────────────────────────
export interface AuthTokens { accessToken: string; refreshToken: string; user: User; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private _user = signal<User | null>(this.loadUser());
  private _token = signal<string | null>(localStorage.getItem('access_token'));

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly role = computed(() => this._user()?.role);

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string): Observable<ApiResponse<AuthTokens>> {
    return this.http.post<ApiResponse<AuthTokens>>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap((res) => {
        const { accessToken, refreshToken, user } = res.data;
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        this._user.set(user);
        this._token.set(accessToken);
      }),
    );
  }

  logout(): void {
    this.http.post(`${this.apiUrl}/logout`, {}).subscribe();
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  refreshToken(): Observable<ApiResponse<AuthTokens>> {
    const refreshToken = localStorage.getItem('refresh_token');
    const user = this.loadUser();
    return this.http.post<ApiResponse<AuthTokens>>(`${this.apiUrl}/refresh`, {
      userId: user?.id, refreshToken,
    }).pipe(
      tap((res) => {
        localStorage.setItem('access_token', res.data.accessToken);
        localStorage.setItem('refresh_token', res.data.refreshToken);
        this._token.set(res.data.accessToken);
      }),
    );
  }

  forgotPassword(email: string) { return this.http.post(`${this.apiUrl}/forgot-password`, { email }); }
  resetPassword(token: string, email: string, newPassword: string) {
    return this.http.post(`${this.apiUrl}/reset-password`, { token, email, newPassword });
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post(`${this.apiUrl}/change-password`, { currentPassword, newPassword });
  }

  getToken(): string | null { return localStorage.getItem('access_token'); }
  hasRole(...roles: UserRole[]): boolean {
    const r = this._user()?.role;
    return !!r && roles.includes(r);
  }
  private clearSession() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    this._user.set(null);
    this._token.set(null);
  }
  private loadUser(): User | null {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }
}

// ─── API SERVICE ─────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;
  constructor(private http: HttpClient) {}

  get<T>(path: string, params?: Record<string, any>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) Object.keys(params).filter((k) => params[k] != null)
      .forEach((k) => { httpParams = httpParams.set(k, String(params[k])); });
    return this.http.get<ApiResponse<T>>(`${this.base}${path}`, { params: httpParams })
      .pipe(map((r) => r.data));
  }
  post<T>(path: string, body: any): Observable<T> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((r) => r.data));
  }
  put<T>(path: string, body: any): Observable<T> {
    return this.http.put<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((r) => r.data));
  }
  patch<T>(path: string, body: any): Observable<T> {
    return this.http.patch<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((r) => r.data));
  }
  delete<T>(path: string): Observable<T> {
    return this.http.delete<ApiResponse<T>>(`${this.base}${path}`).pipe(map((r) => r.data));
  }
  getBlob(path: string): Observable<Blob> {
    return this.http.get(`${this.base}${path}`, { responseType: 'blob' });
  }

  uploadFile<T>(path: string, formData: FormData): Observable<T> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, formData)
      .pipe(map((r) => r.data));
  }
}
