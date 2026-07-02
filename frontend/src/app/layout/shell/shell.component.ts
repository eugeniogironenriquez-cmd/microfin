import { Component, computed, inject, signal } from '@angular/core';
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
interface NavGroup { label: string; icon: string; children: NavItem[]; }
// Una entrada del menú puede ser un ítem suelto o un grupo con hijos
type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).children !== undefined;
}

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
            <mat-icon style="color:#7cc4e3;font-size:18px">person</mat-icon>
            <div class="user-info">
              <span class="user-name">{{ auth.user()?.name }}</span>
              <span class="user-role">{{ auth.user()?.roleName || auth.user()?.role }}</span>
            </div>
          </div>
        </div>

        <mat-nav-list class="nav-list">
          @for (entry of visibleEntries(); track entry.label) {
            @if (entry.isGroup) {
              <!-- Grupo colapsable -->
              <a mat-list-item class="nav-group-header" (click)="toggleGroup(entry.label)">
                <mat-icon matListItemIcon>{{ entry.icon }}</mat-icon>
                <span matListItemTitle>{{ entry.label }}</span>
                <span matListItemMeta class="chevron" [class.open]="isOpen(entry.label)">⌄</span>
              </a>
              @if (isOpen(entry.label)) {
                @for (child of entry.children; track child.route) {
                  <a mat-list-item class="nav-child" [routerLink]="child.route" routerLinkActive="active"
                     [routerLinkActiveOptions]="{ exact: child.exact ?? false }"
                     (click)="isMobile() && sidenav.close()">
                    <mat-icon matListItemIcon>{{ child.icon }}</mat-icon>
                    <span matListItemTitle>{{ child.label }}</span>
                  </a>
                }
              }
            } @else {
              <!-- Ítem suelto -->
              <a mat-list-item [routerLink]="entry.route" routerLinkActive="active"
                 [routerLinkActiveOptions]="{ exact: entry.exact ?? false }"
                 (click)="isMobile() && sidenav.close()">
                <mat-icon matListItemIcon>{{ entry.icon }}</mat-icon>
                <span matListItemTitle>{{ entry.label }}</span>
              </a>
            }
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
  styles: [`
    /* Cabecera de grupo: ícono + texto + flecha en una sola línea */
    .nav-group-header { cursor: pointer; }
    .nav-group-header .chevron {
      display: inline-block;
      transition: transform .2s;
      color: rgba(247,250,252,.5) !important;
      font-size: 18px; line-height: 1;
      font-weight: 700;
    }
    .nav-group-header .chevron.open { transform: rotate(180deg); }
    /* Hijos indentados */
    .nav-child { padding-left: 18px !important; }
    .nav-child ::ng-deep .mdc-list-item__primary-text { font-size: 13px !important; }
  `],
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private breakpoint = inject(BreakpointObserver);
  isMobile = toSignal(
    this.breakpoint.observe([Breakpoints.Handset]).pipe(map(r => r.matches)),
    { initialValue: false },
  );

  // Grupos abiertos (acordeón). Por defecto, todos cerrados.
  private openGroups = signal<Set<string>>(new Set());

  toggleGroup(label: string) {
    const s = new Set(this.openGroups());
    if (s.has(label)) s.delete(label);
    else s.add(label);
    this.openGroups.set(s);
  }
  isOpen(label: string): boolean {
    return this.openGroups().has(label);
  }

  // Estructura del menú: ítems sueltos + grupos con hijos.
  // Cada ítem/hijo se muestra según su permiso (perm). Sin perm = visible para todos.
  private readonly entries: NavEntry[] = [
    { label: 'Dashboard',  icon: 'dashboard',              route: '/dashboard',  perm: 'dashboard.ver' },
    { label: 'Cartera',    icon: 'account_balance_wallet', route: '/portfolio',  perm: 'cartera.ver' },
    { label: 'Clientes',   icon: 'people',                 route: '/customers',  perm: 'clientes.ver' },
    {
      label: 'Créditos', icon: 'attach_money',
      children: [
        { label: 'Préstamos',          icon: 'attach_money', route: '/loans',             perm: 'prestamos.ver' },
        { label: 'Próximos a liquidar', icon: 'flag',        route: '/proximos-liquidar', perm: 'prestamos.proximos' },
        { label: 'Cargar créditos',    icon: 'upload_file',  route: '/carga-manual',      perm: 'prestamos.importar' },
        { label: 'Desembolso',         icon: 'payments',     route: '/disbursements',     perm: 'prestamos.desembolsar' },
        { label: 'Reestructuración',   icon: 'refresh',      route: '/restructuring',     perm: 'prestamos.reestructurar' },
      ],
    },
    {
      label: 'Pagos', icon: 'payment',
      children: [
        { label: 'Pagos',            icon: 'payment',  route: '/payments',         perm: 'pagos.ver', exact: true },
        { label: 'Monitor de pagos', icon: 'monitor',  route: '/payments/monitor', perm: 'pagos.monitor' },
        { label: 'Eliminar mora',    icon: 'gavel',    route: '/eliminar-mora',    perm: 'moratorios.eliminar' },
        { label: 'Consulta de Pagos', icon: 'manage_search', route: '/payments/consulta-pagos', perm: 'pagos.consultar' },
      ],
    },
    {
      label: 'Cobranza', icon: 'directions_bike',
      children: [
        { label: 'Cobranza',            icon: 'directions_bike', route: '/collection',  perm: 'cobranza.ver' },
        { label: 'Monitor de cobranza', icon: 'map',             route: '/monitor-geo', perm: 'cobranza.monitor' },
      ],
    },
    {
      label: 'Caja y gastos', icon: 'point_of_sale',
      children: [
        { label: 'Caja',   icon: 'point_of_sale', route: '/cash',     perm: 'caja.ver' },
        { label: 'Gastos', icon: 'receipt_long',  route: '/expenses', perm: 'gastos.ver' },
      ],
    },
    {
      label: 'Reportes', icon: 'bar_chart',
      children: [
        { label: 'Reportes',         icon: 'bar_chart', route: '/reports',          perm: 'reportes.ver' },
        { label: 'Reporte ubicación', icon: 'map',      route: '/reports/location', perm: 'reportes.ubicacion' },
      ],
    },
    {
      label: 'Configuración', icon: 'settings',
      children: [
        { label: 'Plazos de crédito', icon: 'tune',     route: '/plazos',      perm: 'config.editar' },
        { label: 'Mora',              icon: 'gavel',    route: '/config-mora', perm: 'config.editar' },
        { label: 'Empresa',           icon: 'business', route: '/company',     perm: 'empresa.editar' },
      ],
    },
    {
      label: 'Administración', icon: 'admin_panel_settings',
      children: [
        { label: 'Usuarios',         icon: 'manage_accounts',      route: '/users', perm: 'usuarios.ver' },
        { label: 'Roles y permisos', icon: 'admin_panel_settings', route: '/roles', perm: 'roles.ver' },
      ],
    },
  ];

  // Filtra por permisos. Un grupo se muestra solo si tiene al menos un hijo visible.
  visibleEntries = computed(() => {
    const u = this.auth.user();
    if (!u) return [] as any[];
    const result: any[] = [];
    for (const e of this.entries) {
      if (isGroup(e)) {
        const children = e.children.filter((c) => !c.perm || this.auth.can(c.perm));
        if (children.length > 0) {
          result.push({ isGroup: true, label: e.label, icon: e.icon, children });
        }
      } else {
        if (!e.perm || this.auth.can(e.perm)) {
          result.push({ isGroup: false, label: e.label, icon: e.icon, route: e.route, exact: e.exact });
        }
      }
    }
    return result;
  });
}
