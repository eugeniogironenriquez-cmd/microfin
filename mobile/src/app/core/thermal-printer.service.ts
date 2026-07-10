import { Injectable, signal, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';
import { AssignedClient, LocalPayment, Empresa, TicketSnapshot } from './models';
import { CollectionService } from './collection.service';

// Clave donde se recuerda la impresora elegida por el cobrador.
const PRINTER_KEY = 'thermal_printer';

export interface SavedPrinter {
  address: string;
  name: string;
  paperWidth?: 58 | 80;   // ancho del papel en mm (default 80)
}

export interface DiscoveredDevice {
  address: string;
  name?: string;
}

// Fallback si aún no se ha descargado la empresa (primer uso sin conexión).
const EMPRESA_FALLBACK: Empresa = {
  nombre: 'MICROCAPITAL - IXTEPEC',
  telefono: '—',
  pieLegal: '',
};

@Injectable({ providedIn: 'root' })
export class ThermalPrinterService {
  // Impresora recordada (se carga al iniciar).
  readonly printer = signal<SavedPrinter | null>(null);

  // Ancho del papel en mm (58 o 80). Default 80 si no está configurado.
  private get paperWidthMm(): 58 | 80 {
    return this.printer()?.paperWidth === 58 ? 58 : 80;
  }

  // Caracteres por línea según el ancho del papel (fuente normal ESC/POS).
  // 58mm ≈ 32 caracteres, 80mm ≈ 48 caracteres.
  private get lineWidth(): number {
    return this.paperWidthMm === 58 ? 29 : 48;
  }

  // Línea separadora del ancho correcto.
  private get separator(): string {
    return '-'.repeat(this.lineWidth);
  }
  // Dispositivos encontrados durante el escaneo.
  readonly devices = signal<DiscoveredDevice[]>([]);
  readonly scanning = signal(false);
  readonly connected = signal(false);

  private collection = inject(CollectionService);

  constructor() {
    this.cargarImpresora();
    // Escucha los dispositivos que va encontrando el escaneo.
    CapacitorThermalPrinter.addListener('discoverDevices', (data: any) => {
      // El plugin entrega la lista acumulada de dispositivos descubiertos.
      const list: DiscoveredDevice[] = (data?.devices || []).map((d: any) => ({
        address: d.address,
        name: d.name,
      }));
      this.devices.set(list);
    });
  }

  /** Empresa desde cache, con fallback si aún no se ha descargado. */
  private async getEmpresa(): Promise<Empresa> {
    const e = await this.collection.getEmpresa();
    return e || EMPRESA_FALLBACK;
  }

  // ── Impresora recordada ─────────────────────────────────
  private async cargarImpresora() {
    try {
      const { value } = await Preferences.get({ key: PRINTER_KEY });
      if (value) this.printer.set(JSON.parse(value));
    } catch { /* sin impresora guardada */ }
  }

  async guardarImpresora(p: SavedPrinter) {
    this.printer.set(p);
    await Preferences.set({ key: PRINTER_KEY, value: JSON.stringify(p) });
  }

  async olvidarImpresora() {
    this.printer.set(null);
    await Preferences.remove({ key: PRINTER_KEY });
  }

  // ── Escaneo / conexión ──────────────────────────────────
  async escanear(): Promise<void> {
    this.devices.set([]);
    this.scanning.set(true);
    try {
      await CapacitorThermalPrinter.startScan();
    } finally {
      // El escaneo se detiene solo tras un tiempo; damos margen para descubrir.
      setTimeout(() => this.detenerEscaneo(), 8000);
    }
  }

  async detenerEscaneo(): Promise<void> {
    try { await CapacitorThermalPrinter.stopScan(); } catch { /* ya detenido */ }
    this.scanning.set(false);
  }

  /** Conecta a la impresora recordada (o a una dirección dada). */
  async conectar(address?: string): Promise<boolean> {
    const addr = address || this.printer()?.address;
    if (!addr) return false;
    try {
      const device = await CapacitorThermalPrinter.connect({ address: addr });
      const ok = device !== null;
      this.connected.set(ok);
      return ok;
    } catch {
      this.connected.set(false);
      return false;
    }
  }

  async estaConectada(): Promise<boolean> {
    try {
      const res: any = await CapacitorThermalPrinter.isConnected();
      const ok = !!(res?.connected ?? res);
      this.connected.set(ok);
      return ok;
    } catch {
      return false;
    }
  }

  // ── Impresión del ticket de pago ────────────────────────
  /**
   * Imprime el comprobante de pago en la impresora térmica 80mm.
   * Funciona offline: usa el LocalPayment que ya tienes en mano, sin tocar
   * el servidor. Todo en negro (sin color), apto para térmica monocromática.
   *
   * Nota: el LocalPayment del móvil no guarda desglose de mora ni fechas por
   * cuota (eso vive en el backend). El ticket offline muestra lo disponible:
   * folio, cliente, fecha, método, cuotas pagadas (por número) y total.
   *
   * Devuelve true si imprimió, false si no hay impresora o falló la conexión.
   */
  async imprimirTicketPago(payment: LocalPayment, client: AssignedClient | null): Promise<boolean> {
    if (!this.printer()) return false;

    // Asegurar conexión (reconecta si hace falta).
    let conectada = await this.estaConectada();
    if (!conectada) conectada = await this.conectar();
    if (!conectada) return false;

    const money = (v: any) =>
      '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const fechaHora = this.formatFechaHora(payment.capturedAt || new Date().toISOString());
    const fechaAplic = this.formatFecha(payment.capturedAt || new Date().toISOString());
    // Folio: receiptNumber o serverId si ya sincronizó; si no, el localId.
    const folio = (payment.receiptNumber || payment.serverId || payment.localId || '—')
      .toString().substring(0, 16).toUpperCase();
    const cliente = client?.customerName || '—';

    // Snapshot con todos los datos del ticket (capturado al pagar, offline-safe).
    const snap = payment.snapshot;

    // Datos de empresa desde cache (offline-safe), con fallback.
    const empresa = await this.getEmpresa();
    const telEmpresa = empresa.telefono && empresa.telefono !== '—'
      ? empresa.telefono : null;

    try {
      let p = CapacitorThermalPrinter.begin();

      // ── Encabezado ──
      p = p.align('center').bold().text(`${empresa.nombre}\n`).clearFormatting();
      if (telEmpresa) p = p.align('center').text(`Tel: ${telEmpresa}\n`);
      p = p.text(`${this.separator}\n`);
      p = p.align('center').bold().text('COMPROBANTE DE PAGO\n').clearFormatting();
      p = p.text(`${this.separator}\n`);

      // ── Datos del crédito / cliente ──
      p = p.align('left');
      p = p.text(`Folio: ${folio}\n`);
      p = p.text(`Cliente: ${cliente}\n`);
      if (snap) {
        p = p.text(`Monto: ${money(snap.principalAmount)}\n`);
        p = p.text(`Cuota: ${money(snap.periodicPayment)}\n`);
        p = p.text(`Saldo: ${money(snap.saldoPendiente)}\n`);
      }
      p = p.text(`${this.separator}\n`);

      // ── Progreso del pago ──
      if (snap && snap.totalCuotas > 0) {
        p = p.text(`Pago realizado: ${snap.cuotaActual}/${snap.totalCuotas}\n`);
        p = p.text(`Pagos pendientes: ${snap.cuotasPendientes}\n`);
      }

      // ── Cuotas pagadas (con su fecha) ──
      if (snap && snap.cuotasPagadas.length > 0) {
        p = p.text('Cuotas pagadas:\n');
        for (const c of snap.cuotasPagadas.slice().sort((a, b) => a.periodo - b.periodo)) {
          const f = c.fecha ? this.formatFecha(c.fecha) : '';
          // "#28            30/06/2026" — número a la izq, fecha a la der.
          // El relleno se adapta al ancho del papel (58/80mm).
          const etiqueta = `  #${c.periodo}`;
          const relleno = Math.max(1, this.lineWidth - etiqueta.length - f.length);
          p = p.text(`${etiqueta}${' '.repeat(relleno)}${f}\n`);
        }
      }
      // Moratorio si aplica (etiqueta como el web: "Importe moratorio:")
      if (snap && snap.mora > 0) {
        p = p.text(`Importe moratorio: ${money(snap.mora)}\n`);
      }
      p = p.text(`${this.separator}\n`);

      // Si aún no se sincroniza, dejarlo claro en el ticket.
      if (!payment.synced) {
        //p = p.align('center').text('** Pendiente de sincronizar **\n');
        //p = p.align('left');
      }

      // ── Total (como el web: "TOTAL RECIBIDO") ──
      p = p.align('center').bold().doubleWidth()
           .text(`TOTAL RECIBIDO\n`)
           .clearFormatting();
      p = p.align('center').bold().doubleWidth()
           .text(`${money(payment.amountPaid)}\n`)
           .clearFormatting();
      p = p.text(`${this.separator}\n`);

      // ── Fechas ──
      p = p.align('left');
      p = p.text(`Fecha : ${fechaHora}\n`);
      //p = p.text(`Fecha de aplicacion: ${fechaAplic}\n`);
      if (payment.method) p = p.text(`Metodo: ${payment.method}\n`);
      p = p.text(`${this.separator}\n`);

      // ── Pie de avisos (pie_legal de la empresa, puede traer varias líneas) ──
      if (empresa.pieLegal) {
        p = p.align('center');
        const lineas = empresa.pieLegal.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const linea of lineas) {
          p = p.text(`${linea}\n`);
        }
      }
      //p = p.text('\n');
      p = p.align('center').bold().text('!Gracias por su pago!!\n').clearFormatting();
      //p = p.align('center').text('Conserve este comprobante\n');

      // Alimentar papel y cortar. Un solo salto para no dejar mucho espacio.
      //p = p.text('\n').cutPaper();

      await p.write();
      return true;
    } catch (e) {
      console.error('Error al imprimir ticket', e);
      return false;
    }
  }

  // ── Impresión de prueba (para la pantalla de ajustes) ───
  async imprimirPrueba(): Promise<boolean> {
    if (!this.printer()) return false;
    let conectada = await this.estaConectada();
    if (!conectada) conectada = await this.conectar();
    if (!conectada) return false;

    const empresa = await this.getEmpresa();

    try {
      await CapacitorThermalPrinter.begin()
        .align('center').bold().text(`${empresa.nombre}\n`).clearFormatting()
        .text(`${this.separator}\n`)
        .text('IMPRESION DE PRUEBA\n')
        .text(`${this.formatFechaHora(new Date().toISOString())}\n`)
        .text(`${this.separator}\n`)
        .text('Si lees esto, la impresora\n')
        .text('esta configurada correctamente.\n')
        .text('\n\n\n')
        .cutPaper()
        .write();
      return true;
    } catch (e) {
      console.error('Error en impresión de prueba', e);
      return false;
    }
  }

  // ── Helper de fecha (hora de México) ────────────────────
  private formatFechaHora(d: any): string {
    try {
      const dt = typeof d === 'string' ? new Date(d) : d;
      return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(dt).replace(',', '');
    } catch { return String(d); }
  }

  // Solo fecha (para "Fecha de aplicación" y las cuotas). Se usa UTC en las
  // fechas de vencimiento (columnas 'date') para no correr el día por zona.
  private formatFecha(d: any): string {
    try {
      const dt = typeof d === 'string' ? new Date(d) : d;
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${dt.getUTCFullYear()}`;
    } catch { return String(d); }
  }
}