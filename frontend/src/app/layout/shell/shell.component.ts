import { Component, computed, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../core/index';

interface NavItem { label: string; icon: string; route: string; perm?: string; exact?: boolean; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatListModule, MatIconModule, MatToolbarModule,
    MatButtonModule, MatMenuModule, MatDividerModule,
  ],
  template: `
    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav #sidenav [mode]="isMobile() ? 'over' : 'side'"
                   [opened]="!isMobile()" class="sidenav">
        <div class="sidenav-header">
          <div class="logo">
            <mat-icon class="logo-icon">account_balance</mat-icon>
            <span class="logo-text">Microcapital-Ixtepec</span>
          </div>
          <div class="user-chip">
            <mat-icon style="color:#4ade80;font-size:18px">person</mat-icon>
            <div class="user-info">
              <span class="user-name">{{ auth.user()?.name }}</span>
              <span class="user-role">{{ auth.user()?.roleName || auth.user()?.role }}</span>
            </div>
          </div>
        </div>
        <mat-nav-list class="nav-list">
          @for (item of visibleNavItems(); track item.route) {
            <a mat-list-item [routerLink]="item.route" routerLinkActive="active"
               [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
               (click)="isMobile() && sidenav.close()">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
        <div class="sidenav-footer">
          <button mat-button class="logout-btn" (click)="auth.logout()">
            <mat-icon>logout</mat-icon> Cerrar sesión
          </button>
        </div>
      </mat-sidenav>
      <mat-sidenav-content class="main-content">
        <mat-toolbar class="toolbar">
          <button mat-icon-button (click)="sidenav.toggle()" style="color:#fff">
            <mat-icon>menu</mat-icon>
          </button>
          <span class="toolbar-title">Microcapital-Ixtepec</span>
          <span class="toolbar-spacer"></span>
          <button mat-icon-button style="color:rgba(247,250,252,.7)" [matMenuTriggerFor]="profileMenu">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #profileMenu="matMenu">
            <button mat-menu-item disabled>
              <mat-icon>person</mat-icon>{{ auth.user()?.email }}
            </button>
            <mat-divider></mat-divider>
            <button mat-menu-item (click)="auth.logout()">
              <mat-icon>logout</mat-icon>Cerrar sesión
            </button>
          </mat-menu>
        </mat-toolbar>
        <div class="content-area">
          <router-outlet></router-outlet>
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private breakpoint = inject(BreakpointObserver);
  isMobile = toSignal(
    this.breakpoint.observe([Breakpoints.Handset]).pipe(map(r => r.matches)),
    { initialValue: false },
  );

  // Cada ítem se muestra según un permiso (perm). Sin perm = visible para todos.
  private readonly navItems: NavItem[] = [
    { label: 'Dashboard',        icon: 'dashboard',              route: '/dashboard',        perm: 'dashboard.ver' },
    { label: 'Cartera',          icon: 'account_balance_wallet', route: '/portfolio',        perm: 'cartera.ver' },
    { label: 'Clientes',         icon: 'people',                 route: '/customers',        perm: 'clientes.ver' },
    { label: 'Préstamos',        icon: 'attach_money',           route: '/loans',            perm: 'prestamos.ver' },
    { label: 'Pagos',            icon: 'payment',                route: '/payments',         perm: 'pagos.ver', exact: true },
    { label: 'Monitor de pagos', icon: 'monitor',                route: '/payments/monitor', perm: 'pagos.monitor' },
    { label: 'Reestructuración', icon: 'refresh',                route: '/restructuring',    perm: 'prestamos.reestructurar' },
    { label: 'Desembolso',       icon: 'payments',               route: '/disbursements',    perm: 'prestamos.desembolsar' },
    { label: 'Cobranza',         icon: 'directions_bike',        route: '/collection',       perm: 'cobranza.ver' },
    { label: 'Caja',             icon: 'point_of_sale',          route: '/cash',             perm: 'caja.ver' },
    { label: 'Gastos',           icon: 'receipt_long',           route: '/expenses',         perm: 'gastos.ver' },
    { label: 'Reportes',         icon: 'bar_chart',              route: '/reports',          perm: 'reportes.ver' },
    { label: 'Rpt. Ubicación',   icon: 'map',                    route: '/reports/location', perm: 'reportes.ubicacion' },
    { label: 'Configuración',    icon: 'settings',               route: '/settings',         perm: 'config.ver' },
    { label: 'Empresa',          icon: 'business',               route: '/company',          perm: 'empresa.editar' },
    { label: 'Moratorios',       icon: 'gavel',                  route: '/late-fee-rules',   perm: 'moratorios.editar' },
    { label: 'Usuarios',         icon: 'manage_accounts',        route: '/users',            perm: 'usuarios.ver' },
    { label: 'Roles y permisos', icon: 'admin_panel_settings',   route: '/roles',            perm: 'roles.ver' },
  ];

  visibleNavItems = computed(() => {
    // Forzar reactividad al usuario actual
    const u = this.auth.user();
    if (!u) return [];
    return this.navItems.filter(item => !item.perm || this.auth.can(item.perm));
  });
}