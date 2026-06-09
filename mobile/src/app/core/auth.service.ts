import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage.service';
import { AuthUser, AuthResponse } from './models';

interface ApiEnvelope<T> { success: boolean; data: T; timestamp: string; }

/**
 * Autenticación contra el backend de Microcapital.
 * Reusa el mismo endpoint /auth/login que el sistema web.
 * El usuario y token quedan persistidos en StorageService (offline).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private readonly base = `${environment.apiUrl}/auth`;

  readonly user = signal<AuthUser | null>(null);

  /** Carga la sesión guardada al iniciar la app (permite uso offline). */
  async loadSession(): Promise<AuthUser | null> {
    const u = await this.storage.getUser();
    this.user.set(u);
    return u;
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await this.storage.getToken();
    return !!token;
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const res = await firstValueFrom(
      this.http.post<ApiEnvelope<AuthResponse>>(`${this.base}/login`, { email, password })
    );
    const { accessToken, refreshToken, user } = res.data;
    await this.storage.setSession(accessToken, refreshToken, user);
    this.user.set(user);
    return user;
  }

  async logout() {
    await this.storage.clearSession();
    this.user.set(null);
  }

  /** Rol del usuario (para distinguir cobrador vs gestor). */
  role(): string | undefined {
    return this.user()?.roleName || this.user()?.role;
  }

  can(perm: string): boolean {
    const u = this.user();
    if (!u) return false;
    if (u.isAdmin) return true;
    return (u.permissions || []).includes(perm);
  }
}
