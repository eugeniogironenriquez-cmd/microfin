import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { ThermalPrinterService } from "../../core/thermal-printer.service";
// en el addIcons, agrega: printOutline
import { printOutline } from "ionicons/icons";
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

  cuotas = signal<CuotaPendiente[]>([]);
  seleccionadas = signal<Set<number>>(new Set());
  loadingCuotas = signal(false);
  info = signal<PaymentInfo | null>(null);

  geo = signal<{ lat: number; lng: number } | null>(null);
  capturingGeo = signal(false);
  saving = signal(false);
  done = signal(false);
  saved = signal<LocalPayment | null>(null);
  ticketText = signal("");

  moraPendiente = computed(() => Number(this.info()?.moraPendiente || 0));

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
      this.amount = this.client()?.periodicPayment || null;
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
      const prox = this.info()!.proximaCuota;
      if (!prox || !this.venceHoy(prox.vence)) {
        this.notify(
          'Este crédito no tiene cuota que venza hoy. Usa "Cuotas" para elegir cuáles pagar, o "Total".',
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
        method: this.method,
        lat: this.geo()?.lat,
        lng: this.geo()?.lng,
        snapshot,
      });
      this.saved.set(payment);
      // Empresa cacheada para que el preview muestre nombre y pie legal reales.
      const empresa = await this.collection.getEmpresa();
      this.ticketText.set(this.ticketSvc.build(payment, this.client(), empresa));
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
      const hoyStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric', month: '2-digit', day: '2-digit',
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
    } else if (inf?.proximaCuota) {
      // Modo Día/Total/Mora: usamos la próxima cuota como la cubierta.
      cuotasPagadas = [{
        periodo: inf.proximaCuota.periodo,
        fecha: inf.proximaCuota.vence,
      }];
    }
 
    const cuotaActual = cuotasPagadas.length > 0
      ? Math.max(...cuotasPagadas.map((x) => x.periodo))
      : 0;
 
    return {
      principalAmount: monto,
      periodicPayment: cuota,
      saldoPendiente: saldo,
      totalCuotas,
      cuotaActual,
      cuotasPendientes: totalCuotas > 0 ? Math.max(0, totalCuotas - cuotaActual) : 0,
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
