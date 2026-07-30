import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { ThermalPrinterService } from "../../core/thermal-printer.service";
// en el addIcons, agrega: printOutline
import { printOutline, informationCircleOutline, calendarOutline } from "ionicons/icons";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonSpinner,
  IonCard,
  IonCardContent,
  IonBadge,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonChip,
  IonCheckbox,
  IonList,
  IonListHeader,
  ToastController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  locationOutline,
  cashOutline,
  checkmarkCircle,
  shareOutline,
  documentTextOutline,
  cloudOfflineOutline,
  checkboxOutline,
} from "ionicons/icons";

import { CollectionService } from "../../core/collection.service";
import { GeoService } from "../../core/geo.service";
import { NetworkService } from "../../core/network.service";
import { TicketService } from "../../core/ticket.service";
import {
  AssignedClient,
  LocalPayment,
  PaymentType,
  PaymentMethod,
  CuotaPendiente,
  PaymentInfo,
} from "../../core/models";

type ModoPago = "DIA" | "SELECTIVO" | "TOTAL" | "MORATORIO";

@Component({
  selector: "app-payment",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonBadge,
    IonSegment,
    IonSegmentButton,
    IonText,
    IonChip,
    IonCheckbox,
    IonList,
    IonListHeader,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"
          ><ion-back-button defaultHref="/clients"></ion-back-button
        ></ion-buttons>
        <ion-title>Registrar pago</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @if (!done()) {
        <ion-card>
          <ion-card-content>
            <h2 class="cli">{{ client()?.customerName }}</h2>

            <!-- Tipo de pago -->
            <ion-label class="lbl">Tipo de pago</ion-label>
            <ion-segment
              [(ngModel)]="paymentType"
              (ionChange)="onTypeChange()"
              value="DIA"
              scrollable
            >
              <ion-segment-button value="DIA"
                ><ion-label>Día</ion-label></ion-segment-button
              >
              <ion-segment-button value="SELECTIVO"
                ><ion-label>Cuotas</ion-label></ion-segment-button
              >
              <ion-segment-button value="TOTAL"
                ><ion-label>Total</ion-label></ion-segment-button
              >
              <ion-segment-button value="MORATORIO"
                ><ion-label>Mora</ion-label></ion-segment-button
              >
            </ion-segment>

            <!-- Modo selectivo: lista de cuotas con casillas -->
            @if (paymentType === "SELECTIVO") {
              @if (loadingCuotas()) {
                <div class="loading-c">
                  <ion-spinner name="crescent"></ion-spinner> Cargando cuotas...
                </div>
              } @else if (!network.online()) {
                <ion-text color="warning">
                  <p class="hint">
                    <ion-icon name="cloud-offline-outline"></ion-icon> Sin
                    conexión: no se pueden listar las cuotas. Usa otro tipo de
                    pago o conéctate.
                  </p>
                </ion-text>
              } @else if (cuotas().length === 0) {
                <p class="muted">No hay cuotas pendientes.</p>
              } @else {
                <ion-list class="cuotas">
                  <ion-list-header>Marca las cuotas que paga</ion-list-header>
                  @for (c of cuotas(); track c.periodo) {
                    <ion-item button (click)="toggleCuota(c.periodo)">
                      <ion-checkbox
                        slot="start"
                        [checked]="seleccionadas().has(c.periodo)"
                      ></ion-checkbox>
                      <ion-label>
                        <h3>
                          Cuota {{ c.periodo }} —
                          {{ c.monto | currency: "MXN" }}
                        </h3>
                        <p>
                          Vence {{ c.vence | date: "dd/MM/yyyy" : "UTC" }}
                          @if (c.vencida) {
                            <span class="venc">· vencida</span>
                          }
                          @if (c.mora > 0) {
                            <span class="mora"
                              >· mora {{ c.mora | currency: "MXN" }}</span
                            >
                          }
                        </p>
                      </ion-label>
                    </ion-item>
                  }
                </ion-list>

                <!-- Casilla aparte para cobrar la mora -->
                @if (moraPendiente() > 0) {
                  <ion-item lines="none" class="mora-check">
                    <ion-checkbox
                      slot="start"
                      [(ngModel)]="cobrarMora"
                      (ionChange)="recalc()"
                    ></ion-checkbox>
                    <ion-label class="ion-text-wrap">
                      Cobrar también la mora ({{
                        moraPendiente() | currency: "MXN"
                      }})
                    </ion-label>
                  </ion-item>
                }
              }
            }

            <!-- Monto -->
            <ion-item>
              <ion-label position="stacked">Monto recibido</ion-label>
              <ion-input type="number" [(ngModel)]="amount" placeholder="0.00">
                <span slot="start">$&nbsp;</span>
              </ion-input>
            </ion-item>

            <!-- Aviso de excedente: informa a dónde irá el sobrante -->
            @if (excedenteEstimado > 0 && !usarSaldoFavor) {
              <ion-text color="medium">
                <p class="excedente-hint">
                  <ion-icon name="information-circle-outline"></ion-icon>
                  Excedente de {{ excedenteEstimado | currency: "MXN" }}:
                  @if (cobrarMora) {
                    se aplica primero a la mora y el resto queda como saldo a favor.
                  } @else {
                    se guardará como saldo a favor del cliente.
                  }
                </p>
              </ion-text>
            }

            <!-- Método -->
            <ion-item>
              <ion-label position="stacked">Método</ion-label>
              <ion-select
                [(ngModel)]="method"
                interface="action-sheet"
                value="EFECTIVO"
              >
                <ion-select-option value="EFECTIVO">Efectivo</ion-select-option>
                <ion-select-option value="TRANSFERENCIA"
                  >Transferencia</ion-select-option
                >
                <ion-select-option value="DEPOSITO">Depósito</ion-select-option>
              </ion-select>
            </ion-item>

            <!-- Usar saldo a favor (si el cliente tiene disponible) -->
            @if (saldoFavorDisponible() > 0) {
              <ion-item lines="none" class="saldo-check">
                <ion-checkbox
                  slot="start"
                  [(ngModel)]="usarSaldoFavor"
                  (ionChange)="onToggleSaldoFavor()"
                ></ion-checkbox>
                <ion-label class="ion-text-wrap">
                  Usar saldo a favor ({{
                    saldoFavorDisponible() | currency: "MXN"
                  }} disponible)
                </ion-label>
              </ion-item>

              @if (usarSaldoFavor) {
                <ion-item>
                  <ion-label position="stacked">
                    Monto a usar (vacío = todo el disponible)
                  </ion-label>
                  <ion-input
                    type="number"
                    [(ngModel)]="montoSaldoFavor"
                    [placeholder]="saldoFavorDisponible().toFixed(2)"
                  >
                    <span slot="start">$&nbsp;</span>
                  </ion-input>
                </ion-item>
                <ion-text color="medium">
                  <p class="excedente-hint">
                    <ion-icon name="information-circle-outline"></ion-icon>
                    Se aplicará
                    {{ saldoFavorAUsar() | currency: "MXN" }} del saldo a favor a
                    este pago.
                  </p>
                </ion-text>
              }
            }

            <!-- Geolocalización -->
            <ion-chip [color]="geo() ? 'success' : 'medium'">
              <ion-icon name="location-outline"></ion-icon>
              <ion-label>
                @if (capturingGeo()) {
                  Obteniendo ubicación...
                } @else if (geo()) {
                  Ubicación capturada
                } @else {
                  Sin ubicación
                }
              </ion-label>
            </ion-chip>

            @if (!network.online()) {
              <ion-text color="warning">
                <p class="hint">
                  <ion-icon name="cloud-offline-outline"></ion-icon> Sin
                  conexión: el pago se guardará y sincronizará después.
                </p>
              </ion-text>
            }

            <ion-button
              expand="block"
              color="primary"
              (click)="submit()"
              [disabled]="saving()"
            >
              @if (saving()) {
                <ion-spinner name="crescent"></ion-spinner>
              } @else {
                <ion-icon slot="start" name="cash-outline"></ion-icon> Registrar
                pago
              }
            </ion-button>
          </ion-card-content>
        </ion-card>

        <!-- Calendario de pagos (informativo) -->
        <ion-card class="cal-card">
          <ion-card-content>
            <div class="cal-title">
              <ion-icon name="calendar-outline"></ion-icon> Calendario de pagos
            </div>
            @if (calendario().length === 0) {
              <p class="cal-empty">Sin calendario disponible.</p>
            } @else {
              <div class="cal-scroll">
                <div class="cal-table">
                <div class="cal-row cal-head">
                  <span class="c-num">#</span>
                  <span class="c-vence">Vence</span>
                  <span class="c-monto">Cuota</span>
                  <span class="c-mora">Mora</span>
                  <span class="c-estatus">Estatus</span>
                  <span class="c-obs">Observaciones</span>
                </div>
                @for (cu of calendario(); track cu.periodo) {
                  <div class="cal-row"
                       [class.row-pagado]="cu.estatus === 'PAGADO'"
                       [class.row-vencido]="cu.vencida && cu.estatus !== 'PAGADO'">
                    <span class="c-num">{{ cu.periodo }}</span>
                    <span class="c-vence">{{ cu.vence | date: 'dd/MM/yy' : 'UTC' }}</span>
                    <span class="c-monto">{{ cu.monto | currency: 'MXN' : 'symbol' : '1.0-0' }}</span>
                    <span class="c-mora">
                      {{ cu.mora > 0 ? (cu.mora | currency: 'MXN' : 'symbol' : '1.0-0') : '—' }}
                    </span>
                    <span class="c-estatus">
                      <ion-badge [class]="cu.estatus === 'PAGADO' ? 'b-pagado' : (cu.vencida ? 'b-vencido' : 'b-pend')">
                        {{ cu.vencida && cu.estatus !== 'PAGADO' ? 'VENCIDO' : cu.estatus }}
                      </ion-badge>
                    </span>
                    <span class="c-obs">{{ cu.notas || '—' }}</span>
                  </div>
                }
                </div>
              </div>
            }
          </ion-card-content>
        </ion-card>
      } @else {
        <!-- Confirmación + ticket -->
        <div class="ok">
          <ion-icon name="checkmark-circle" color="success"></ion-icon>
          <h2>Pago registrado</h2>
          <p>
            {{
              saved()?.synced
                ? "Sincronizado con el servidor"
                : "Guardado — se sincronizará al recuperar conexión"
            }}
          </p>
        </div>

        <ion-card>
          <ion-card-content>
            <pre class="ticket">{{ ticketText() }}</pre>
          </ion-card-content>
        </ion-card>

        <ion-button expand="block" (click)="imprimir()">
          <ion-icon slot="start" name="print-outline"></ion-icon>
          Imprimir ticket
        </ion-button>
        <ion-button expand="block" fill="outline" (click)="share()">
          <ion-icon slot="start" name="share-outline"></ion-icon>
          Compartir ticket
        </ion-button>
        <ion-button expand="block" (click)="finish()">Listo</ion-button>
      }
    </ion-content>
  `,
  styles: [
    `
      .cli {
        margin: 0 0 12px;
        font-size: 18px;
        font-weight: 700;
        color: #1c4532;
      }
      .lbl {
        font-size: 13px;
        color: #718096;
        margin: 8px 0 4px;
        display: block;
      }
      .muted {
        color: #718096;
        font-size: 13px;
      }
      .hint {
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .excedente-hint {
        font-size: 13px;
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 6px 4px 0;
        line-height: 1.35;
      }
      .excedente-hint ion-icon {
        font-size: 16px;
        margin-top: 1px;
        flex-shrink: 0;
      }
      ion-segment {
        margin-bottom: 8px;
      }
      .loading-c {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #718096;
        margin: 12px 0;
        font-size: 14px;
      }
      .cuotas {
        margin: 8px 0;
      }
      .cuotas ion-list-header {
        font-size: 13px;
        color: #4a5568;
        min-height: auto;
      }
      .venc {
        color: #dc2626;
        font-weight: 600;
      }
      .mora {
        color: #d97706;
        font-weight: 600;
      }
      .mora-check {
        --background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 8px;
        margin: 8px 0;
        font-size: 13px;
      }
      .saldo-check {
        --background: #ecfdf5;
        border: 1px solid #a7f3d0;
        border-radius: 8px;
        margin: 8px 0;
        font-size: 13px;
      }
      .ok {
        text-align: center;
        padding: 24px 0 8px;
      }
      .ok ion-icon {
        font-size: 64px;
      }
      .ok h2 {
        margin: 8px 0 4px;
      }
      .ok p {
        color: #718096;
        font-size: 14px;
        margin: 0;
      }
      .ticket {
        font-family: "Courier New", monospace;
        font-size: 12px;
        white-space: pre-wrap;
        line-height: 1.5;
        margin: 0;
      }
      .cal-card { margin-top: 12px; }
      .cal-title {
        display: flex; align-items: center; gap: 6px;
        font-weight: 700; font-size: 15px; margin-bottom: 10px;
        color: var(--ion-color-primary);
      }
      .cal-empty { color: #888; font-size: 13px; }
      /* Scroll horizontal: en móvil la tabla no cabe completa, así el cobrador
         puede desplazarse para ver las observaciones sin que se corten. */
      .cal-scroll {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .cal-table { font-size: 12px; min-width: 560px; }
      .cal-row {
        display: grid;
        grid-template-columns: 26px 64px 66px 56px 74px 180px;
        gap: 6px; align-items: center;
        padding: 6px 2px;
        border-bottom: 1px solid #eee;
      }
      .cal-head {
        font-weight: 700; font-size: 10px; text-transform: uppercase;
        color: #888; border-bottom: 2px solid #ddd;
      }
      .row-pagado { background: #f7f7f7; color: #999; }
      .row-vencido { background: #fff5f5; }
      .c-monto, .c-mora { text-align: right; }
      .c-obs {
        font-size: 11px; color: #666;
        white-space: normal;
        word-break: break-word;
      }
      ion-badge.b-pagado { --background: #d4f4dd; --color: #1a7f37; }
      ion-badge.b-vencido { --background: #ffd7d7; --color: #c0392b; }
      ion-badge.b-pend { --background: #eef1f5; --color: #566; }
    `,
  ],
})
export class PaymentPage implements OnInit {
  readonly collection = inject(CollectionService);
  readonly printer = inject(ThermalPrinterService);
  readonly network = inject(NetworkService);
  private geoSvc = inject(GeoService);
  private ticketSvc = inject(TicketService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  client = signal<AssignedClient | null>(null);
  amount: number | null = null;
  paymentType: ModoPago = "DIA";
  method: PaymentMethod = "EFECTIVO";
  cobrarMora = false;
  // Uso de saldo a favor
  usarSaldoFavor = false;
  montoSaldoFavor: number | null = null;   // null = usar todo el disponible

  cuotas = signal<CuotaPendiente[]>([]);
  seleccionadas = signal<Set<number>>(new Set());
  loadingCuotas = signal(false);
  info = signal<PaymentInfo | null>(null);
  // Calendario completo del crédito (informativo, todas las cuotas).
  calendario = signal<any[]>([]);

  geo = signal<{ lat: number; lng: number } | null>(null);
  capturingGeo = signal(false);
  saving = signal(false);
  done = signal(false);
  saved = signal<LocalPayment | null>(null);
  ticketText = signal("");

  moraPendiente = computed(() => Number(this.info()?.moraPendiente || 0));

  // Saldo a favor disponible: si hay info del backend (con conexión) se usa ese;
  // si no, se cae al valor cacheado del cliente (para funcionar offline).
  saldoFavorDisponible = computed(() => {
    const info = this.info();
    if (info && info.saldoFavor != null) return Number(info.saldoFavor);
    return Number(this.client()?.saldoFavor || 0);
  });

  // Excedente estimado: cuánto del monto recibido supera lo que se está pagando
  // (cuotas seleccionadas o saldo/cuota según el modo). Solo informativo para
  // el cobrador; el cálculo definitivo lo hace el backend.
  get excedenteEstimado(): number {
    const monto = Number(this.amount || 0);
    if (monto <= 0) return 0;
    let requerido = 0;
    if (this.paymentType === "SELECTIVO") {
      for (const c of this.cuotas()) {
        if (this.seleccionadas().has(c.periodo)) requerido += Number(c.monto);
      }
      if (this.cobrarMora) requerido += this.moraPendiente();
    } else if (this.paymentType === "DIA") {
      requerido = Number(this.info()?.cuotaHoy?.monto ?? this.client()?.periodicPayment ?? 0);
    } else if (this.paymentType === "TOTAL") {
      requerido = Number(this.info()?.saldoPendiente ?? 0);
    } else if (this.paymentType === "MORATORIO") {
      requerido = this.moraPendiente();
    }
    return Math.round(Math.max(0, monto - requerido) * 100) / 100;
  }

  constructor() {
    addIcons({
      locationOutline,
      cashOutline,
      checkmarkCircle,
      shareOutline,
      documentTextOutline,
      cloudOfflineOutline,
      checkboxOutline,
      printOutline,
      informationCircleOutline,
      calendarOutline,
    });
  }

  async ngOnInit() {
    const loanId = this.route.snapshot.paramMap.get("loanId")!;
    const c =
      this.collection.clients().find((x) => x.loanId === loanId) || null;
    this.client.set(c);
    if (c?.periodicPayment) this.amount = c.periodicPayment;

    this.capturingGeo.set(true);
    const pos = await this.geoSvc.getCurrentPosition();
    this.geo.set(pos);
    this.capturingGeo.set(false);

    if (await this.network.isOnline()) {
      try {
        this.info.set(await this.collection.getPaymentInfo(loanId));
      } catch {
        /* sin info */
      }
    }

    // Cargar el calendario completo (informativo). Del cache local, que ya se
    // descarga al sincronizar; funciona también sin conexión.
    await this.cargarCalendario(loanId);
  }

  // Arma el calendario para mostrar: marca vencidas y calcula mora pendiente.
  private async cargarCalendario(loanId: string) {
    const hoy = this.hoyMexicoUTC();
    const cuotas = await this.collection.getCuotasLocal(loanId);
    const cal = (cuotas || []).map((c: any) => {
      const dueUTC = this.fechaUTC(c.vence);
      const pagada = c.estatus === "PAGADO";
      const mora = Math.max(
        0,
        Number(c.moraGenerada || 0) - Number(c.moraPagada || 0),
      );
      return {
        periodo: c.periodo,
        vence: c.vence,
        monto: Number(c.monto ?? c.saldo ?? 0),
        mora,
        estatus: c.estatus,
        vencida: !pagada && dueUTC < hoy,
        notas: c.notas ?? null,
      };
    });
    this.calendario.set(cal);
  }

  private hoyMexicoUTC(): number {
    const MX = 6 * 60 * 60 * 1000;
    const d = new Date(Date.now() - MX);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  private fechaUTC(v: string | Date): number {
    const d = new Date(v);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  async onTypeChange() {
    this.seleccionadas.set(new Set());
    this.cobrarMora = false;
    if (this.paymentType === "SELECTIVO") {
      this.amount = 0;
      if (await this.network.isOnline()) {
        this.loadingCuotas.set(true);
        try {
          this.cuotas.set(
            await this.collection.getCuotasPendientes(this.client()!.loanId),
          );
        } catch {
          this.cuotas.set([]);
        } finally {
          this.loadingCuotas.set(false);
        }
      }
    } else if (this.paymentType === "DIA") {
      this.amount =
        this.info()?.cuotaHoy?.monto ?? this.client()?.periodicPayment ?? null;
    } else if (this.paymentType === "TOTAL") {
      this.amount = this.info()?.saldoPendiente || null;
    } else if (this.paymentType === "MORATORIO") {
      this.amount = this.moraPendiente() || null;
    }
  }

  toggleCuota(periodo: number) {
    const set = new Set(this.seleccionadas());
    if (set.has(periodo)) set.delete(periodo);
    else set.add(periodo);
    this.seleccionadas.set(set);
    this.recalc();
  }

  recalc() {
    let total = 0;
    for (const c of this.cuotas()) {
      if (this.seleccionadas().has(c.periodo)) total += Number(c.monto);
    }
    if (this.cobrarMora) total += this.moraPendiente();
    this.amount = Math.round(total * 100) / 100;
  }

  // Monto de saldo a favor que se aplicará: el capturado (si es válido) o todo
  // el disponible. Nunca más que el disponible.
  saldoFavorAUsar(): number {
    if (!this.usarSaldoFavor) return 0;
    const disp = this.saldoFavorDisponible();
    const capturado = Number(this.montoSaldoFavor || 0);
    if (capturado > 0) return Math.min(capturado, disp);
    return disp;
  }

  onToggleSaldoFavor() {
    // Al desactivar, limpiar el monto parcial para no arrastrar un valor viejo.
    if (!this.usarSaldoFavor) this.montoSaldoFavor = null;
  }

  async submit() {
    const isSelectivo = this.paymentType === "SELECTIVO";
    if (isSelectivo && this.seleccionadas().size === 0) {
      this.notify("Marca al menos una cuota");
      return;
    }
    if (!this.amount || this.amount <= 0) {
      this.notify("Ingresa un monto válido");
      return;
    }

    // ── Validación del pago "Día": solo si la próxima cuota vence HOY ──
    // Replica la regla del backend para avisar en campo, antes de guardar.
    // Solo se valida si hay info() cargado (hubo conexión al abrir). Sin
    // info (offline), se permite con la advertencia de siempre.
    if (this.paymentType === "DIA" && this.info()) {
      const cuotaHoy = this.info()!.cuotaHoy;

      if (!cuotaHoy) {
        this.notify(
          'Este crédito no tiene cuota pendiente para hoy. Usa "Cuotas" para elegir cuotas vencidas, o "Total".',
          3800,
        );
        return;
      }
    }

    this.saving.set(true);
    try {
      const periodosPagados = isSelectivo
        ? Array.from(this.seleccionadas()).sort((a, b) => a - b)
        : undefined;

      // ── Snapshot del ticket (para impresión completa, online u offline) ──
      const snapshot = this.buildSnapshot(periodosPagados);

      const payment = await this.collection.registerPayment({
        loanId: this.client()!.loanId,
        amountPaid: Number(this.amount),
        paymentType: isSelectivo ? "TOTAL" : (this.paymentType as PaymentType),
        periodos: periodosPagados,
        applyExcedenteToMora: isSelectivo ? this.cobrarMora : undefined,
        // Uso de saldo a favor (si el cobrador lo activó).
        usarSaldoFavor: this.usarSaldoFavor,
        montoSaldoFavor: this.usarSaldoFavor
          ? this.saldoFavorAUsar()
          : undefined,
        // El excedente se guarda como saldo a favor, EXCEPTO cuando se está
        // usando saldo a favor en este mismo pago (el backend lo prohíbe para
        // no anular el uso). Si se cobra mora, el backend la salda primero y
        // guarda el resto.
        guardarExcedenteSaldoFavor: !this.usarSaldoFavor,
        method: this.method,
        lat: this.geo()?.lat,
        lng: this.geo()?.lng,
        snapshot,
      });
      this.saved.set(payment);
      // Empresa cacheada para que el preview muestre nombre y pie legal reales.
      const empresa = await this.collection.getEmpresa();
      this.ticketText.set(
        this.ticketSvc.build(payment, this.client(), empresa),
      );
      this.done.set(true);
    } catch (e: any) {
      this.notify(e?.error?.message || "Error al registrar el pago");
    } finally {
      this.saving.set(false);
    }
  }

  private venceHoy(vence: string): boolean {
    if (!vence) return false;
    try {
      // Día de vencimiento: los primeros 10 chars "YYYY-MM-DD" (evita corrimientos).
      const venceStr = vence.substring(0, 10);
      // Hoy en zona de México, en formato YYYY-MM-DD.
      const hoyStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()); // en-CA da "YYYY-MM-DD"
      return venceStr === hoyStr;
    } catch {
      return false;
    }
  }

  private buildSnapshot(periodosPagados?: number[]): any {
    const c = this.client();
    const inf = this.info();
    const monto = Number(c?.principalAmount || 0);
    const cuota = Number(c?.periodicPayment || 0);
    const saldo = Number(inf?.saldoPendiente || 0);
    const totalCuotas = Number(c?.termWeeks || 0);

    // Cuotas pagadas en esta transacción, con su fecha de vencimiento.
    let cuotasPagadas: Array<{ periodo: number; fecha?: string }> = [];
    if (periodosPagados && periodosPagados.length > 0) {
      // Modo selectivo: buscamos la fecha de cada periodo en cuotas().
      cuotasPagadas = periodosPagados.map((p) => {
        const cu = this.cuotas().find((x) => x.periodo === p);
        return { periodo: p, fecha: cu?.vence };
      });
    } else if (this.paymentType === "DIA" && inf?.cuotaHoy) {
      cuotasPagadas = [
        {
          periodo: inf.cuotaHoy.periodo,
          fecha: inf.cuotaHoy.vence,
        },
      ];
    } else if (inf?.proximaCuota) {
      cuotasPagadas = [
        {
          periodo: inf.proximaCuota.periodo,
          fecha: inf.proximaCuota.vence,
        },
      ];
    }

    const cuotaActual =
      cuotasPagadas.length > 0
        ? Math.max(...cuotasPagadas.map((x) => x.periodo))
        : 0;

    return {
      principalAmount: monto,
      periodicPayment: cuota,
      saldoPendiente: saldo,
      totalCuotas,
      cuotaActual,
      cuotasPendientes:
        totalCuotas > 0 ? Math.max(0, totalCuotas - cuotaActual) : 0,
      cuotasPagadas,
      mora: this.cobrarMora ? this.moraPendiente() : 0,
    };
  }

  async share() {
    const text = this.ticketText();
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ text });
        return;
      } catch {
        /* cancelado */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      this.notify("Ticket copiado");
    } catch {
      this.notify("No se pudo compartir");
    }
  }

  async imprimir() {
    const pay = this.saved();
    if (!pay) return;

    if (!this.printer.printer()) {
      this.notify("Configura una impresora en Ajustes primero");
      return;
    }

    const ok = await this.printer.imprimirTicketPago(pay, this.client());
    this.notify(
      ok
        ? "Ticket enviado a la impresora"
        : "No se pudo imprimir. Revisa la impresora.",
    );
  }

  finish() {
    this.router.navigate(["/clients"], { replaceUrl: true });
  }

  private async notify(message: string, duration = 2200) {
    const t = await this.toast.create({
      message,
      duration,
      position: "bottom",
    });
    await t.present();
  }
}