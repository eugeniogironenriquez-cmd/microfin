import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/index';

// Leaflet se carga desde CDN en runtime (ver loadLeaflet()). Declaramos L como any.
declare const L: any;

interface GeoPayment {
  id: string; lat: number; lng: number; amount: number;
  collectorId?: string; customerName?: string; paymentDate: string; receiptNumber?: string;
}
interface GeoVisit {
  id: string; loanId: string; tipo: string; lat: number; lng: number;
  notas?: string; registradoPor?: string; creadoEn: string;
}

@Component({
  selector: 'app-geo-monitor',
  standalone: true,
  imports: [
    CommonModule, FormsModule, CurrencyPipe, DatePipe,
    MatCardModule, MatButtonToggleModule, MatFormFieldModule,
    MatInputModule, MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Monitor de cobranza</h1>
        <p class="sub">Ubicación de pagos y visitas registrados en campo</p>
      </div>
    </div>

    <mat-card class="filters">
      <div class="filters-row">
        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput type="date" [(ngModel)]="fecha" (ngModelChange)="reload()">
        </mat-form-field>

        <mat-button-toggle-group [(ngModel)]="filtro" (ngModelChange)="applyFilter()" multiple>
          <mat-button-toggle value="pagos">
            <mat-icon>payments</mat-icon> Pagos ({{ payments().length }})
          </mat-button-toggle>
          <mat-button-toggle value="visitas">
            <mat-icon>directions_walk</mat-icon> Visitas ({{ visits().length }})
          </mat-button-toggle>
        </mat-button-toggle-group>
      </div>
    </mat-card>

    <mat-card class="map-card">
      @if (loading()) {
        <div class="loading-overlay"><mat-spinner diameter="48"></mat-spinner></div>
      }
      @if (!loading() && total() === 0) {
        <div class="empty">
          <mat-icon>location_off</mat-icon>
          <p>No hay registros con ubicación para esta fecha.</p>
          <span>Los pagos y visitas con geolocalización aparecerán aquí.</span>
        </div>
      }
      <div id="geo-map" class="map" [style.display]="total() > 0 ? 'block' : 'none'"></div>
    </mat-card>

    <!-- Leyenda -->
    @if (total() > 0) {
      <div class="legend">
        <span><i class="dot dot-pago"></i> Pago</span>
        <span><i class="dot dot-promesa"></i> Promesa de pago</span>
        <span><i class="dot dot-nolocalizado"></i> No localizado</span>
      </div>
    }
  `,
  styles: [`
    .page-header { margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#171923; margin:0; }
    .page-header .sub { color:#718096; font-size:14px; margin:4px 0 0; }
    .filters { margin-bottom:16px; }
    .filters-row { display:flex; gap:16px; align-items:center; flex-wrap:wrap; padding:8px; }
    .map-card { position:relative; padding:0; overflow:hidden; }
    .map { width:100%; height:560px; border-radius:8px; }
    .loading-overlay {
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(255,255,255,.7); z-index:500;
    }
    .empty { text-align:center; padding:64px 24px; color:#718096; }
    .empty mat-icon { font-size:56px; width:56px; height:56px; color:#CBD5E0; }
    .empty p { margin:12px 0 4px; font-weight:600; }
    .empty span { font-size:13px; }
    .legend {
      display:flex; gap:20px; padding:12px 4px; font-size:13px; color:#4A5568; flex-wrap:wrap;
    }
    .legend .dot { display:inline-block; width:12px; height:12px; border-radius:50%; margin-right:6px; vertical-align:middle; }
    .dot-pago { background:#16A34A; }
    .dot-promesa { background:#D97706; }
    .dot-nolocalizado { background:#DC2626; }
  `],
})
export class GeoMonitorComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  fecha = new Date().toISOString().slice(0, 10);  // hoy YYYY-MM-DD
  filtro: string[] = ['pagos', 'visitas'];

  payments = signal<GeoPayment[]>([]);
  visits = signal<GeoVisit[]>([]);
  loading = signal(true);

  total = computed(() => this.payments().length + this.visits().length);

  private map: any;
  private markersLayer: any;
  private leafletReady = false;

  async ngOnInit() {
    await this.loadLeaflet();
    await this.reload();
  }

  ngOnDestroy() {
    if (this.map) { this.map.remove(); this.map = null; }
  }

  // Carga Leaflet (JS + CSS) desde CDN una sola vez
  private loadLeaflet(): Promise<void> {
    if (this.leafletReady || (window as any).L) { this.leafletReady = true; return Promise.resolve(); }
    return new Promise((resolve) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => { this.leafletReady = true; resolve(); };
      document.body.appendChild(script);
    });
  }

  async reload() {
    this.loading.set(true);
    try {
      const [pagos, visitas] = await Promise.all([
        this.fetchPayments(),
        this.fetchVisits(),
      ]);
      this.payments.set(pagos);
      this.visits.set(visitas);
      this.loading.set(false);
      // Esperar a que el div del mapa sea visible antes de renderizar
      setTimeout(() => this.renderMap(), 50);
    } catch {
      this.loading.set(false);
    }
  }

  private async fetchPayments(): Promise<GeoPayment[]> {
    return new Promise((resolve) => {
      this.api.get<any>('/payments/geo', { date: this.fecha }).subscribe({
        next: (r) => resolve(Array.isArray(r) ? r : r?.data ?? []),
        error: () => resolve([]),
      });
    });
  }

  private async fetchVisits(): Promise<GeoVisit[]> {
    return new Promise((resolve) => {
      this.api.get<any>('/visitas/geo', { date: this.fecha }).subscribe({
        next: (r) => resolve(Array.isArray(r) ? r : r?.data ?? []),
        error: () => resolve([]),
      });
    });
  }

  applyFilter() {
    this.renderMap();
  }

  private renderMap() {
    if (!this.leafletReady || this.total() === 0) return;

    // Inicializar el mapa una sola vez
    if (!this.map) {
      const el = document.getElementById('geo-map');
      if (!el) return;
      // Centro por defecto: Ciudad Ixtepec, Oaxaca
      this.map = L.map('geo-map').setView([16.5607, -95.0983], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(this.map);
      this.markersLayer = L.layerGroup().addTo(this.map);
    }

    // Limpiar marcadores previos
    this.markersLayer.clearLayers();
    const bounds: any[] = [];

    // Pagos (verde)
    if (this.filtro.includes('pagos')) {
      for (const p of this.payments()) {
        if (!p.lat || !p.lng) continue;
        const m = L.circleMarker([p.lat, p.lng], this.dotStyle('#16A34A'));
        m.bindPopup(this.popupPago(p));
        m.addTo(this.markersLayer);
        bounds.push([p.lat, p.lng]);
      }
    }

    // Visitas (ámbar promesa / rojo no localizado)
    if (this.filtro.includes('visitas')) {
      for (const v of this.visits()) {
        if (!v.lat || !v.lng) continue;
        const color = v.tipo === 'PROMESA_PAGO' ? '#D97706' : '#DC2626';
        const m = L.circleMarker([v.lat, v.lng], this.dotStyle(color));
        m.bindPopup(this.popupVisita(v));
        m.addTo(this.markersLayer);
        bounds.push([v.lat, v.lng]);
      }
    }

    // Ajustar vista a los marcadores
    if (bounds.length > 0) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
    // Recalcular tamaño (por si el contenedor cambió de visibilidad)
    setTimeout(() => this.map.invalidateSize(), 100);
  }

  private dotStyle(color: string) {
    return { radius: 9, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.9 };
  }

  private popupPago(p: GeoPayment): string {
    const monto = (p.amount || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const fecha = new Date(p.paymentDate).toLocaleString('es-MX');
    return `<strong>Pago</strong><br>${p.customerName || ''}<br>${monto}<br><small>${fecha}</small>`
      + (p.receiptNumber ? `<br><small>${p.receiptNumber}</small>` : '');
  }

  private popupVisita(v: GeoVisit): string {
    const tipo = v.tipo === 'PROMESA_PAGO' ? 'Promesa de pago' : 'No localizado';
    const fecha = new Date(v.creadoEn).toLocaleString('es-MX');
    return `<strong>Visita: ${tipo}</strong>` + (v.notas ? `<br>${v.notas}` : '') + `<br><small>${fecha}</small>`;
  }
}