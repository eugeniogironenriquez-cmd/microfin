// ============================================================
// COLLECTION PAGE - Pantalla principal del cobrador
// ============================================================
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem,
  IonLabel, IonBadge, IonButton, IonIcon, IonRefresher, IonRefresherContent,
  IonSearchbar, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonChip, IonSpinner, IonProgressBar, IonNote } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline, cloudUploadOutline, personOutline,
  walletOutline, alertCircleOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { MobileAuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';

addIcons({ refreshOutline, cloudUploadOutline, personOutline,
  walletOutline, alertCircleOutline, checkmarkCircleOutline });

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [
    CommonModule, CurrencyPipe, RouterLink,
    IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem,
    IonLabel, IonBadge, IonButton, IonIcon, IonRefresher, IonRefresherContent,
    IonSearchbar, IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    IonChip, IonSpinner, IonProgressBar, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>
          Mis clientes — {{ today }}
        </ion-title>
        <ion-button slot="end" fill="clear" color="light" (click)="sync()">
          <ion-icon name="cloud-upload-outline" slot="icon-only"></ion-icon>
          @if (syncService.pendingCount() > 0) {
            <ion-badge color="danger">{{ syncService.pendingCount() }}</ion-badge>
          }
        </ion-button>
      </ion-toolbar>

      <!-- Estado de sync -->
      @if (syncService.syncState() === 'syncing') {
        <ion-progress-bar type="indeterminate"></ion-progress-bar>
      }
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Banner de sync -->
      @if (syncService.pendingCount() > 0) {
        <ion-card color="warning">
          <ion-card-content>
            <div class="sync-banner">
              <ion-icon name="alert-circle-outline"></ion-icon>
              <span>{{ syncService.pendingCount() }} operaciones pendientes de sincronizar</span>
              <ion-button size="small" (click)="sync()" fill="outline">Sync</ion-button>
            </div>
          </ion-card-content>
        </ion-card>
      }

      <!-- Buscador -->
      <ion-searchbar
        placeholder="Buscar cliente"
        (ionInput)="onSearch($event)"
        debounce="300">
      </ion-searchbar>

      <!-- Lista de clientes -->
      @if (loading()) {
        <div class="loading-center">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      } @else if (filtered().length === 0) {
        <div class="empty-state">
          <ion-icon name="person-outline" size="large"></ion-icon>
          <p>No tienes clientes asignados hoy</p>
        </div>
      } @else {
        <ion-list>
          @for (loan of filtered(); track loan.id) {
            <ion-item
              [routerLink]="['/collection/detail', loan.id]"
              detail="true"
              class="loan-item">
              <ion-label>
                <h2>{{ loan.customer?.fullName }}</h2>
                <p>{{ loan.customer?.phone }} — Cuota: {{ loan.periodicPayment | currency:'MXN' }}</p>
                <ion-note>
                  @if (getOverdueDays(loan) > 0) {
                    <ion-chip color="danger" class="overdue-chip">
                      <ion-icon name="alert-circle-outline"></ion-icon>
                      {{ getOverdueDays(loan) }} días vencido
                    </ion-chip>
                  } @else {
                    <ion-chip color="success">Al corriente</ion-chip>
                  }
                </ion-note>
              </ion-label>
              <ion-badge slot="end" [color]="getOverdueDays(loan) > 0 ? 'danger' : 'success'">
                {{ loan.status }}
              </ion-badge>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: [`
    .sync-banner { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .loading-center { display: flex; justify-content: center; padding: 48px; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 24px; color: var(--ion-color-medium); text-align: center; }
    .empty-state ion-icon { font-size: 48px; }
    .overdue-chip { font-size: 11px; height: 22px; }
  `],
})
export class CollectionPage implements OnInit {
  readonly auth = inject(MobileAuthService);
  readonly syncService = inject(SyncService);
  private http = inject(HttpClient);

  loans = signal<any[]>([]);
  loading = signal(true);
  searchTerm = signal('');
  today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' });

  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.loans();
    return this.loans().filter((l) =>
      l.customer?.fullName?.toLowerCase().includes(term) ||
      l.customer?.phone?.includes(term),
    );
  });

  ngOnInit() { this.loadClients(); }

  loadClients() {
    this.loading.set(true);
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
    this.http.get<any>(`${this.auth.getApiUrl()}/collection/my-clients`, { headers }).subscribe({
      next: (res) => { this.loans.set(res.data || res); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onSearch(event: any) { this.searchTerm.set(event.target.value || ''); }

  getOverdueDays(loan: any): number {
    const nextPending = loan.paymentSchedules?.find((s: any) => s.status !== 'PAGADO');
    if (!nextPending) return 0;
    const due = new Date(nextPending.dueDate);
    const today = new Date();
    if (due > today) return 0;
    return Math.floor((today.getTime() - due.getTime()) / 86400000);
  }

  async sync() { await this.syncService.sync(); }

  async refresh(event: any) {
    this.loadClients();
    setTimeout(() => event.target.complete(), 1000);
  }
}
