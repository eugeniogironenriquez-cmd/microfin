import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonIcon,
  IonButton,
  IonButtons,
  IonSearchbar,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonNote,
  IonChip,
  ToastController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  logOutOutline,
  cloudUploadOutline,
  syncOutline,
  personCircleOutline,
  checkmarkCircle,
  alertCircle,
  warningOutline,
  chevronForward,
  refreshOutline,
  settingsOutline,
  locationOutline,
} from "ionicons/icons";

import { AuthService } from "../../core/auth.service";
import { CollectionService } from "../../core/collection.service";
import { StorageService } from "../../core/storage.service";
import { NetworkService } from "../../core/network.service";
import { MobilePermissionsService } from "../../services/mobile-permissions.service";
import { AssignedClient } from "../../core/models";

@Component({
  selector: "app-clients",
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonIcon,
    IonButton,
    IonButtons,
    IonSearchbar,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonNote,
    IonChip,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>{{
          mp.esGestor() ? "Cartera en rojo" : "Mis clientes"
        }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="sync()" [disabled]="collection.syncing()">
            @if (collection.syncing()) {
              <ion-spinner name="crescent"></ion-spinner>
            } @else {
              <ion-icon slot="icon-only" name="sync-outline"></ion-icon>
            }
          </ion-button>
          <ion-button (click)="irAjustes()">
            <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
          </ion-button>
          <ion-button (click)="logout()">
            <ion-icon slot="icon-only" name="log-out-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- Barra de estado de sincronización -->
      @if (collection.pendingCount() > 0) {
        <ion-chip color="warning" class="sync-chip" (click)="sync()">
          <ion-icon name="cloud-upload-outline"></ion-icon>
          <ion-label
            >{{ collection.pendingCount() }} pago(s) por sincronizar</ion-label
          >
        </ion-chip>
      }

      <ion-searchbar
        placeholder="Buscar cliente..."
        [debounce]="200"
        (ionInput)="onSearch($event)"
      ></ion-searchbar>

      @if (loading()) {
        <div class="center"><ion-spinner name="crescent"></ion-spinner></div>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <ion-icon name="person-circle-outline"></ion-icon>
          <p>
            {{
              mp.esGestor()
                ? "No hay créditos en rojo con cuota para hoy."
                : "No hay clientes con cuota pendiente para hoy."
            }}
          </p>
          <ion-button fill="outline" (click)="download()">
            <ion-icon slot="start" name="refresh-outline"></ion-icon>
            {{ mp.esGestor() ? "Actualizar cartera" : "Descargar clientes" }}
          </ion-button>
        </div>
      } @else {
        <ion-list>
          @for (c of filtered(); track c.loanId) {
            <ion-item button (click)="open(c)">
              <ion-icon
                [name]="estadoIcon(c.estado)"
                [color]="estadoColor(c.estado)"
                slot="start"
              ></ion-icon>
              <ion-label>
                <h2>{{ c.customerName }}</h2>
                @if (c.addressLine) {
                  <p class="domicilio">
                    <ion-icon name="location-outline"></ion-icon>
                    {{ c.addressLine }}
                  </p>
                }
                <p>
                  @if (c.proximaCuota) {
                    Cuota {{ c.proximaCuota.periodo }}:
                    {{
                      c.proximaCuota.monto
                        | currency: "MXN" : "symbol" : "1.0-0"
                    }}
                  } @else {
                    Cuota:
                    {{
                      c.periodicPayment | currency: "MXN" : "symbol" : "1.0-0"
                    }}
                  }
                  · {{ c.phone || "s/tel" }}
                </p>
              </ion-label>
              <ion-badge slot="end" [class]="estadoBadge(c.estado)">
                {{ estadoLabel(c.estado) }}
              </ion-badge>
              <ion-icon
                name="chevron-forward"
                slot="end"
                color="medium"
              ></ion-icon>
            </ion-item>
          }
        </ion-list>
        <ion-note class="foot-note">
          {{ filtered().length }} cliente(s) · Última descarga en cache
        </ion-note>
      }
    </ion-content>
  `,
  styles: [
    `
      .center {
        display: flex;
        justify-content: center;
        padding: 40px;
      }
      .empty {
        text-align: center;
        padding: 48px 24px;
        color: #718096;
      }
      .empty ion-icon {
        font-size: 64px;
        color: #cbd5e0;
      }
      .empty p {
        margin: 12px 0 20px;
      }
      .sync-chip {
        margin: 10px 12px 0;
      }
      .domicilio {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #718096;
        font-size: 13px;
      }
      .domicilio ion-icon {
        font-size: 14px;
        flex-shrink: 0;
      }
      .foot-note {
        display: block;
        text-align: center;
        padding: 16px;
        font-size: 12px;
      }
      /* Estado ATRASADO: ámbar, distinto del rojo de VENCIDO */
      .estado-atrasado {
        --background: #fef3c7;
        --color: #92400e;
        background: #fef3c7;
        color: #92400e;
      }
    `,
  ],
})
export class ClientsPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly network = inject(NetworkService);
  readonly mp = inject(MobilePermissionsService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastController);
  private storage = inject(StorageService);

  loading = signal(true);
  search = signal("");

  filtered = computed(() => {
    const term = this.search().toLowerCase().trim();
    const pagadosLocal = this.pagadosHoyLocal();

    // Regla: solo se muestran los créditos con la cuota de HOY pendiente.
    // Si el cliente ya pagó lo de hoy, se oculta aunque siga atrasado
    // (el cobrador ya cobró ahí, no necesita volver).
    //
    // Dos fuentes de "ya pagó hoy":
    //  1. `tieneCuotaHoy` del backend: false si la cuota de hoy está pagada.
    //  2. Pagos locales aún sin sincronizar (cobros hechos sin conexión):
    //     el backend no los conoce todavía, así que se filtran aquí.
    const list = this.collection.clients().filter(
      (cliente) =>
        cliente.tieneCuotaHoy === true &&
        !pagadosLocal.has(cliente.loanId),
    );

    if (!term) {
      return list;
    }

    return list.filter(
      (cliente) =>
        cliente.customerName.toLowerCase().includes(term) ||
        (cliente.phone || "").includes(term) ||
        (cliente.addressLine || "").toLowerCase().includes(term),
    );
  });

  /** Créditos con un pago registrado HOY que aún no se sincroniza. */
  pagadosHoyLocal = signal<Set<string>>(new Set());

  /**
   * Relee los pagos locales pendientes y marca los créditos cobrados hoy.
   * Así, un cobro hecho sin conexión también oculta al cliente de la lista.
   */
  private async actualizarPagadosLocal() {
    try {
      const pendientes = await this.storage.getPendingPayments();
      const hoy = this.obtenerFechaLocalActual();
      const set = new Set<string>();
      for (const p of pendientes) {
        // capturedAt es ISO; comparamos solo la parte de fecha local.
        const fechaPago = p.capturedAt
          ? new Date(p.capturedAt).toLocaleDateString('en-CA')  // YYYY-MM-DD local
          : '';
        if (fechaPago === hoy) set.add(p.loanId);
      }
      this.pagadosHoyLocal.set(set);
    } catch {
      // Si falla, no se filtra por pagos locales (mejor mostrar de más que de menos).
    }
  }

  private obtenerFechaLocalActual(): string {
    const hoy = new Date();

    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, "0");
    const day = String(hoy.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  private normalizarFecha(fecha: string): string {
    /*
     * Admite valores como:
     * 2026-07-10
     * 2026-07-10T00:00:00.000Z
     * 2026-07-10 00:00:00
     *
     * No usamos new Date(fecha) porque podría modificar el día
     * por diferencia de zona horaria.
     */
    const coincidencia = fecha.match(/^\d{4}-\d{2}-\d{2}/);

    return coincidencia ? coincidencia[0] : "";
  }

  constructor() {
    addIcons({
      logOutOutline,
      cloudUploadOutline,
      syncOutline,
      personCircleOutline,
      checkmarkCircle,
      alertCircle,
      warningOutline,
      chevronForward,
      refreshOutline,
      settingsOutline,
      locationOutline,
    });
  }

  // ── Helpers de estado (3 estados) ──
  estadoIcon(estado: string): string {
    if (estado === "vencido") return "alert-circle";
    if (estado === "atrasado") return "warning-outline";
    return "checkmark-circle";
  }
  estadoColor(estado: string): string {
    if (estado === "vencido") return "danger";
    if (estado === "atrasado") return "warning";
    return "success";
  }
  estadoBadge(estado: string): string {
    if (estado === "vencido") return "estado-vencido";
    if (estado === "atrasado") return "estado-atrasado";
    return "estado-corriente";
  }
  estadoLabel(estado: string): string {
    if (estado === "vencido") return "Vencido";
    if (estado === "atrasado") return "Atrasado";
    return "Al corriente";
  }

  async ngOnInit() {
    // Mostrar cache primero (offline-first), luego intentar refrescar
    await this.collection.loadFromCache();
    await this.actualizarPagadosLocal();
    this.loading.set(false);
    if (this.network.online()) {
      await this.download(true);
    }
  }

  /**
   * Ionic dispara esto CADA VEZ que se entra a la pantalla (a diferencia de
   * ngOnInit, que solo corre al crearla). Es lo que hace que, al volver de
   * registrar un pago, la lista se refresque y el cliente ya cobrado
   * desaparezca (porque el backend ya no lo marca con cuota de hoy pendiente).
   */
  async ionViewWillEnter() {
    // Siempre releer los pagos locales (cubre los cobros offline).
    await this.actualizarPagadosLocal();

    // Evitar descargar en la primera entrada: ngOnInit ya lo hizo.
    if (this.primeraEntrada) {
      this.primeraEntrada = false;
      return;
    }
    if (this.network.online()) {
      await this.download(true);   // silencioso: sin toast
    } else {
      await this.collection.loadFromCache();
    }
  }

  private primeraEntrada = true;

  async download(silent = false) {
    if (!this.network.online()) {
      if (!silent) this.notify("Sin conexión — mostrando datos guardados");
      return;
    }
    try {
      // El gestor ve los rojos de toda la cartera; el cobrador, sus asignados.
      if (this.mp.esGestor()) {
        await this.collection.downloadClientsGestor();
      } else {
        await this.collection.downloadClients();
      }
      await this.collection.downloadEmpresa();
      if (!silent) this.notify("Clientes actualizados");
    } catch {
      if (!silent) this.notify("No se pudo descargar");
    }
  }

  async doRefresh(ev: any) {
    await this.download();
    await this.actualizarPagadosLocal();
    ev.target.complete();
  }

  async sync() {
    if (!this.network.online()) {
      this.notify("Sin conexión");
      return;
    }
    const r = await this.collection.syncPending();
    this.notify(
      `Sincronizados: ${r.ok}` + (r.fail ? ` · Fallidos: ${r.fail}` : ""),
    );
    await this.download(true);
    // Tras sincronizar, los pagos ya no son "locales pendientes":
    // el backend ya los conoce y actualiza tieneCuotaHoy.
    await this.actualizarPagadosLocal();
  }

  onSearch(ev: any) {
    this.search.set(ev.target.value || "");
  }

  open(c: AssignedClient) {
    this.router.navigate(["/client", c.loanId]);
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(["/login"], { replaceUrl: true });
  }

  irAjustes() {
    this.router.navigate(["/settings"]);
  }

  private async notify(message: string) {
    const t = await this.toast.create({
      message,
      duration: 2200,
      position: "bottom",
    });
    await t.present();
  }
}