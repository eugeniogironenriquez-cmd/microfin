import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, AuthService } from '../../core/index';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, RouterLink, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="dash-header">
      <div>
        <h1 class="dash-title">Dashboard</h1>
        <p class="dash-sub">Resumen de la cartera en tiempo real</p>
      </div>
    </div>

    @if (loading()) {
      <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
    } @else {
      <div class="kpi-row-dash">
        <div class="kpi-dash kpi-blue">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">{{ isCobrador() ? 'Mis créditos activos' : 'Créditos activos' }}</div>
            <div class="kpi-dash-value">{{ summary().active | number }}</div>
            <div class="kpi-dash-sub"><span class="kpi-arrow up">↑</span> {{ summary().total | number }} {{ isCobrador() ? 'asignados' : 'totales' }}</div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>attach_money</mat-icon></div>
        </div>
        <div class="kpi-dash kpi-purple">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">Vencidos</div>
            <div class="kpi-dash-value">{{ summary().overdue | number }}</div>
            <div class="kpi-dash-sub">
              <span class="kpi-arrow down">↑</span>
              {{ summary().active > 0 ? ((summary().overdue / summary().active)*100).toFixed(1) : '0' }}% de activos
            </div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>warning</mat-icon></div>
        </div>
        <div class="kpi-dash kpi-dark">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">Reestructurados</div>
            <div class="kpi-dash-value">{{ summary().restructured | number }}</div>
            <div class="kpi-dash-sub"><span class="kpi-arrow">—</span> {{ summary().settled | number }} liquidados</div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>refresh</mat-icon></div>
        </div>
        <div class="kpi-dash kpi-amber">
          <div class="kpi-dash-left">
            <div class="kpi-dash-label">Cartera vigente</div>
            <div class="kpi-dash-value">{{ summary().totalActiveAmount | currency:'MXN':'symbol':'1.0-0' }}</div>
            <div class="kpi-dash-sub"><span class="kpi-arrow up">↑</span> Capital en campo</div>
          </div>
          <div class="kpi-dash-icon"><mat-icon>account_balance_wallet</mat-icon></div>
        </div>
      </div>

      <!-- Accesos rápidos según permisos -->
      @if (quickItems().length > 0) {
        <div class="quick-actions">
          <h2 class="section-title">Accesos rápidos</h2>
          <div class="quick-grid">
            @for (item of quickItems(); track item.route) {
              <a class="quick-card" [routerLink]="item.route">
                <mat-icon>{{ item.icon }}</mat-icon>
                <span>{{ item.label }}</span>
              </a>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    .dash-header { margin-bottom:28px; }
    .dash-title { font-family:'Inter',sans-serif; font-size:28px; font-weight:700; color:#171923; letter-spacing:-.48px; margin:0 0 4px; }
    .dash-sub   { font-family:'Inter',sans-serif; font-size:14px; color:#718096; margin:0; }
    .kpi-row-dash { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:32px; }
    @media(max-width:900px){ .kpi-row-dash { grid-template-columns:1fr 1fr; } }
    @media(max-width:500px){ .kpi-row-dash { grid-template-columns:1fr; } }
    .kpi-dash { border-radius:16px; padding:22px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; position:relative; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.15); }
    .kpi-dash::after { content:''; position:absolute; right:-20px; top:-20px; width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,.08); }
    .kpi-blue   { background:linear-gradient(135deg,#4F7AF8,#6B5CE7); }
    .kpi-purple { background:linear-gradient(135deg,#9B59B6,#6B5CE7); }
    .kpi-dark   { background:linear-gradient(135deg,#2C3E6B,#1a2547); }
    .kpi-amber  { background:linear-gradient(135deg,#F59E0B,#D97706); }
    .kpi-dash-left { flex:1; }
    .kpi-dash-label { font-family:'Inter',sans-serif; font-size:13px; font-weight:500; color:rgba(255,255,255,.75); margin-bottom:6px; }
    .kpi-dash-value { font-family:'Inter',sans-serif; font-size:32px; font-weight:700; color:#fff; letter-spacing:-.68px; line-height:1; margin-bottom:8px; }
    .kpi-dash-sub   { font-family:'Inter',sans-serif; font-size:12px; color:rgba(255,255,255,.65); display:flex; align-items:center; gap:4px; }
    .kpi-arrow { font-size:12px; font-weight:700; }
    .kpi-arrow.up   { color:#86efac; }
    .kpi-arrow.down { color:#fca5a5; transform:rotate(180deg); display:inline-block; }
    .kpi-dash-icon { width:48px; height:48px; background:rgba(255,255,255,.15); border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; z-index:1; }
    .kpi-dash-icon mat-icon { color:#fff !important; font-size:24px; width:24px; height:24px; }
    .quick-actions { margin-top:8px; }
    .quick-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; margin-top:16px; }
    .quick-card { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:24px 16px; background:#fff; border:1px solid #CBD5E0; border-radius:12px; text-decoration:none; color:#1C4532; font-family:'Inter',sans-serif; font-size:13px; font-weight:600; transition:all .2s; cursor:pointer; }
    .quick-card mat-icon { font-size:28px; width:28px; height:28px; color:#1C4532 !important; }
    .quick-card:hover { background:#F0FFF4; border-color:#1C4532; transform:translateY(-2px); box-shadow:0 6px 20px rgba(28,69,50,.12); }
  `],
})
export class DashboardComponent implements OnInit {
  private api  = inject(ApiService);
  readonly auth = inject(AuthService);

  loading = signal(true);
  summary = signal({ active:0, overdue:0, restructured:0, settled:0, total:0, totalActiveAmount:0 });

  isCobrador = computed(() => this.auth.role() === 'COBRADOR');

  // Accesos rápidos filtrados por PERMISO (no por rol legacy)
  quickItems = computed(() => {
    // forzar reactividad al usuario actual
    const u = this.auth.user();
    if (!u) return [];
    const all = [
      { label:'Nueva solicitud', icon:'add_circle',      route:'/loans/new',        perm:'prestamos.crear' },
      { label:'Registrar pago',  icon:'payment',         route:'/payments',         perm:'pagos.registrar' },
      { label:'Nuevo cliente',   icon:'person_add',      route:'/customers/new',    perm:'clientes.crear' },
      { label:'Desembolsos',     icon:'payments',        route:'/disbursements',    perm:'prestamos.desembolsar' },
      { label:'Ver cartera',     icon:'bar_chart',       route:'/portfolio',        perm:'cartera.ver' },
      { label:'Registrar gasto', icon:'receipt_long',    route:'/expenses',         perm:'gastos.registrar' },
      { label:'Cobranza',        icon:'directions_bike', route:'/collection',       perm:'cobranza.ver' },
      { label:'Monitor pagos',   icon:'monitor',         route:'/payments/monitor', perm:'pagos.monitor' },
    ];
    return all.filter(i => this.auth.can(i.perm));
  });

  ngOnInit() {
    const role = this.auth.role();
    if (role === 'COBRADOR') {
      // Cobrador: solo ve sus créditos asignados
      this.api.get<any>('/collection/my-clients').subscribe({
        next: (loans: any[]) => {
          const list = Array.isArray(loans) ? loans : (loans as any)?.data ?? [];
          const active   = list.filter((l: any) => l.status === 'ACTIVO').length;
          const overdue  = list.filter((l: any) => l.status === 'VENCIDO').length;
          const total    = list.reduce((s: number, l: any) => s + Number(l.principalAmount || 0), 0);
          this.summary.set({
            active,
            overdue,
            restructured: 0,
            settled:      0,
            total:        list.length,
            totalActiveAmount: total,
          });
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    } else {
      this.api.get<any>('/reports/portfolio').subscribe({
        next: (s) => {
          this.summary.set({
            active:            Number(s.active || 0),
            overdue:           Number(s.overdue || 0),
            restructured:      Number(s.restructured || 0),
            settled:           Number(s.settled || 0),
            total:             Number(s.total || 0),
            totalActiveAmount: Number(s.totalActiveAmount || 0),
          });
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    }
  }
}