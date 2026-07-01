import { Injectable, signal, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';
import { AssignedClient, LocalPayment, Empresa } from './models';
import { CollectionService } from './collection.service';

// Clave donde se recuerda la impresora elegida por el cobrador.
const PRINTER_KEY = 'thermal_printer';

export interface SavedPrinter {
  address: string;
  name: string;
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

    const fecha = this.formatFechaHora(payment.capturedAt || new Date().toISOString());
    // Folio: receiptNumber o serverId si ya sincronizó; si no, el localId.
    const folio = (payment.receiptNumber || payment.serverId || payment.localId || '—')
      .toString().substring(0, 12).toUpperCase();
    const cliente = client?.customerName || '—';
    const periodos = payment.periodos || [];

    // Datos de empresa desde cache (offline-safe), con fallback.
    const empresa = await this.getEmpresa();
    const telEmpresa = empresa.telefono && empresa.telefono !== '—'
      ? empresa.telefono : null;

    try {
      let p = CapacitorThermalPrinter.begin();

      // ── Encabezado ──
      p = p.align('center').bold().text(`${empresa.nombre}\n`).clearFormatting();
      if (telEmpresa) p = p.align('center').text(`Tel: ${telEmpresa}\n`);
      p = p.text('--------------------------------\n');
      p = p.align('center').bold().text('COMPROBANTE DE PAGO\n').clearFormatting();
      p = p.text('--------------------------------\n');

      // ── Datos ──
      p = p.align('left');
      p = p.text(`Folio: ${folio}\n`);
      p = p.text(`Cliente: ${cliente}\n`);
      p = p.text(`Fecha: ${fecha}\n`);
      if (payment.method) p = p.text(`Metodo: ${payment.method}\n`);
      // Si aún no se sincroniza, dejarlo claro en el ticket.
      if (!payment.synced) p = p.text('** Pendiente de sincronizar **\n');
      p = p.text('--------------------------------\n');

      // ── Cuotas pagadas (por número; modo selectivo) ──
      if (periodos.length > 0) {
        const lista = periodos.map((n) => `#${n}`).join('  ');
        p = p.text('Cuotas pagadas:\n');
        p = p.text(`  ${lista}\n`);
        p = p.text('--------------------------------\n');
      }

      // ── Total ──
      p = p.align('center').bold().doubleWidth()
           .text(`TOTAL: ${money(payment.amountPaid)}\n`)
           .clearFormatting();
      p = p.text('--------------------------------\n');

      // ── Pie de avisos (pie_legal de la empresa, puede traer varias líneas) ──
      if (empresa.pieLegal) {
        p = p.align('center');
        const lineas = empresa.pieLegal.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const linea of lineas) {
          p = p.text(`${linea}\n`);
        }
      }
      p = p.text('\n');
      p = p.align('center').bold().text('Gracias por su pago\n').clearFormatting();
      p = p.text('Conserve este comprobante\n');

      // Alimentar papel y cortar.
      p = p.text('\n\n\n').cutPaper();

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
        .text('--------------------------------\n')
        .text('IMPRESION DE PRUEBA\n')
        .text(`${this.formatFechaHora(new Date().toISOString())}\n`)
        .text('--------------------------------\n')
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
}