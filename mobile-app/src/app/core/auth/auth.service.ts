// ============================================================
// MOBILE - Auth Service con Capacitor Preferences
// ============================================================
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Preferences } from '@capacitor/preferences';
import { tap } from 'rxjs';

export interface MobileUser {
  id: string; email: string; name: string; role: string;
}

@Injectable({ providedIn: 'root' })
export class MobileAuthService {
  private _user = signal<MobileUser | null>(null);
  private _token = signal<string | null>(null);
  private apiUrl = 'http://10.0.2.2:3000/api/v1'; // Android emulator

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly token = this._token.asReadonly();

  constructor(private http: HttpClient) {
    this.restoreSession();
  }

  async restoreSession() {
    const token = await Preferences.get({ key: 'access_token' });
    const user = await Preferences.get({ key: 'user' });
    if (token.value && user.value) {
      this._token.set(token.value);
      this._user.set(JSON.parse(user.value));
    }
  }

  login(email: string, password: string) {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      tap(async (res) => {
        const { accessToken, refreshToken, user } = res.data;
        await Preferences.set({ key: 'access_token', value: accessToken });
        await Preferences.set({ key: 'refresh_token', value: refreshToken });
        await Preferences.set({ key: 'user', value: JSON.stringify(user) });
        this._token.set(accessToken);
        this._user.set(user);
      }),
    );
  }

  async logout() {
    await Preferences.remove({ key: 'access_token' });
    await Preferences.remove({ key: 'refresh_token' });
    await Preferences.remove({ key: 'user' });
    this._user.set(null);
    this._token.set(null);
  }

  getApiUrl() { return this.apiUrl; }
}
