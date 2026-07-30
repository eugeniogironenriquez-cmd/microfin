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

  // Evita refrescos concurrentes: si ya hay un refresh en curso,
  // las demás peticiones esperan el mismo resultado.
  private refreshInFlight: Promise<string | null> | null = null;

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

  /**
   * Renueva el access token usando el refresh token guardado.
   * Devuelve el nuevo access token, o null si no se pudo renovar
   * (sin refresh token, sin conexión, o refresh token expirado).
   * Reusa el mismo endpoint /auth/refresh que el sistema web: { userId, refreshToken }.
   */
  async refreshToken(): Promise<string | null> {
    // Si ya hay un refresh en curso, reusar esa misma promesa
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = await this.storage.getRefreshToken();
    const user = await this.storage.getUser();
    if (!refreshToken || !user) return null;
    try {
      const res = await firstValueFrom(
        this.http.post<ApiEnvelope<AuthResponse>>(`${this.base}/refresh`, {
          userId: user.id,
          refreshToken,
        })
      );
      const newAccess = res.data.accessToken;
      const newRefresh = res.data.refreshToken;
      await this.storage.setToken(newAccess);
      // El backend puede rotar el refresh token; si viene uno nuevo, guardarlo
      if (newRefresh) {
        await this.storage.setSession(newAccess, newRefresh, user);
      }
      return newAccess;
    } catch {
      return null;
    }
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
