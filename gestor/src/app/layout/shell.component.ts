import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { AuthService } from '../core/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  perm?: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule,
    MatButtonModule, MatMenuModule,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav #snav
        [mode]="isHandset() ? 'over' : 'side'"
        [opened]="!isHandset()"
        class="sidenav">
        <div class="brand">
          <div class="brand-mark"><mat-icon>support_agent</mat-icon></div>
          <div class="brand-txt">
            <strong>Gestión</strong>
            <span>Cobranza</span>
          </div>
        </div>

        <mat-nav-list>
          @for (item of visibleNav(); track item.route) {
            <a mat-list-item [routerLink]="item.route" routerLinkActive="active"
               (click)="isHandset() && snav.close()">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content>
        <mat-toolbar class="topbar">
          @if (isHandset()) {
            <button mat-icon-button (click)="snav.toggle()">
              <mat-icon>menu</mat-icon>
            </button>
          }
          <span class="topbar-title">{{ titulo() }}</span>
          <span class="spacer"></span>

          <button mat-button [matMenuTriggerFor]="userMenu" class="user-btn">
            <mat-icon>account_circle</mat-icon>
            <span class="user-name">{{ auth.user()?.name || 'Usuario' }}</span>
            <mat-icon>arrow_drop_down</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="menu-head">
              <strong>{{ auth.user()?.name }}</strong>
              <small>{{ auth.user()?.email }}</small>
            </div>
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon> Cerrar sesión
            </button>
          </mat-menu>
        </mat-toolbar>

        <main class="content">
          <router-outlet></router-outlet>
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .shell { height: 100vh; }
    .sidenav {
      width: 250px;
      background: linear-gradient(180deg, #0d3a52 0%, #123f57 100%);
      border: none;
    }
    .brand {
      display: flex; align-items: center; gap: 12px;
      padding: 20px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .brand-mark {
      width: 40px; height: 40px; border-radius: 10px;
      background: linear-gradient(140deg, #2595ca, #2083b2);
      display: flex; align-items: center; justify-content: center;
    }
    .brand-mark mat-icon { color: #fff; }
    .brand-txt { display: flex; flex-direction: column; line-height: 1.1; }
    .brand-txt strong { color: #fff; font-size: 16px; }
    .brand-txt span { color: #6fbae0; font-size: 12px; }

    mat-nav-list { padding-top: 8px; }
    .sidenav a[mat-list-item] {
      color: rgba(255,255,255,0.85);
      margin: 2px 8px;
      border-radius: 8px;
      --mat-list-list-item-leading-icon-color: rgba(255,255,255,0.7);
      --mdc-list-list-item-label-text-color: rgba(255,255,255,0.85);
      --mdc-list-list-item-hover-label-text-color: #ffffff;
      --mdc-list-list-item-focus-label-text-color: #ffffff;
    }
    .sidenav a[mat-list-item] .mdc-list-item__primary-text,
    .sidenav a[mat-list-item] span[matListItemTitle] {
      color: rgba(255,255,255,0.85) !important;
    }
    .sidenav a[mat-list-item]:hover {
      background: rgba(255,255,255,0.08);
    }
    .sidenav a[mat-list-item]:hover .mdc-list-item__primary-text {
      color: #ffffff !important;
    }
    .sidenav a.active {
      background: rgba(37,149,202,0.28);
      --mat-list-list-item-leading-icon-color: #6fbae0;
    }
    .sidenav a.active .mdc-list-item__primary-text {
      color: #ffffff !important;
    }

    .topbar {
      background: #fff;
      color: var(--blue-900, #0d3a52);
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      position: sticky; top: 0; z-index: 5;
    }
    .topbar-title { font-size: 16px; font-weight: 600; }
    .spacer { flex: 1 1 auto; }
    .user-btn { color: #2d3748; }
    .user-name { margin: 0 4px; font-size: 14px; }
    .menu-head {
      padding: 10px 16px; display: flex; flex-direction: column;
      border-bottom: 1px solid #edf2f7;
    }
    .menu-head small { color: #718096; }

    .content { min-height: calc(100vh - 64px); background: var(--gray-50, #f7fafc); }

    @media (max-width: 599px) {
      .user-name { display: none; }
    }
  `],
})
export class ShellComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  private bp = inject(BreakpointObserver);

  isHandset = toSignal(
    this.bp.observe(Breakpoints.Handset).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  private nav: NavItem[] = [
    { label: 'Monitor de cartera', icon: 'monitor_heart', route: '/monitor', perm: 'cartera.semaforo' },
    { label: 'Gestión de cobranza', icon: 'support_agent', route: '/gestor', perm: 'cobranza.gestor' },
    { label: 'Umbrales del semáforo', icon: 'tune', route: '/config', perm: 'config.editar' },
  ];

  visibleNav = signal<NavItem[]>(
    this.nav.filter((i) => !i.perm || this.auth.can(i.perm)),
  );

  titulo = signal<string>('Portal de Gestión');

  logout() {
    this.auth.logout();
  }
}