import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Descarga y abre/comparte los documentos PDF del crédito (contrato, plan de
 * pagos, tarjeta de control).
 *
 * Los endpoints requieren token JWT, así que no se puede abrir la URL directa
 * en el navegador (no lleva el header). Se descarga como blob (con la auth del
 * interceptor) y se abre desde una URL local.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  readonly descargando = signal<boolean>(false);

  /** Contrato del crédito (PDF). */
  async abrirContrato(loanId: string): Promise<void> {
    return this.descargarYAbrir(
      `${this.base}/loans/${loanId}/pdf`,
      `contrato-${loanId.substring(0, 8)}.pdf`,
    );
  }

  /** Plan / calendario de pagos del crédito (PDF). */
  async abrirCalendario(loanId: string): Promise<void> {
    return this.descargarYAbrir(
      `${this.base}/loans/${loanId}/plan-pdf`,
      `plan-pagos-${loanId.substring(0, 8)}.pdf`,
    );
  }

  /** Tarjeta de control de pagos (PDF). */
  async abrirTarjeta(loanId: string): Promise<void> {
    return this.descargarYAbrir(
      `${this.base}/loans/${loanId}/tarjeta`,
      `tarjeta-${loanId.substring(0, 8)}.pdf`,
    );
  }

  /**
   * Descarga el PDF (con auth) y lo abre en una pestaña/visor del dispositivo.
   * El usuario puede desde ahí guardarlo o compartirlo con las opciones nativas.
   */
  private async descargarYAbrir(url: string, filename: string): Promise<void> {
    this.descargando.set(true);
    try {
      const blob = await firstValueFrom(
        this.http.get(url, { responseType: 'blob' }),
      );
      const blobUrl = URL.createObjectURL(blob);

      // Abrir en una pestaña nueva: el visor de PDF del sistema lo muestra y
      // ofrece las acciones nativas (guardar, compartir, imprimir).
      const win = window.open(blobUrl, '_blank');

      if (!win) {
        // Si el navegador bloqueó la ventana, forzar la descarga con un enlace.
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.click();
      }

      // Liberar la URL después de un momento (dar tiempo a que abra).
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } finally {
      this.descargando.set(false);
    }
  }

  /**
   * Comparte el documento por WhatsApp. Como no tenemos el plugin de Share de
   * Capacitor, se usa la Web Share API si está disponible (soporta archivos en
   * navegadores modernos); si no, se abre WhatsApp con un mensaje de texto.
   */
  async compartirWhatsApp(
    loanId: string,
    tipo: 'contrato' | 'calendario',
    telefono?: string,
    nombreCliente?: string,
  ): Promise<void> {
    const url =
      tipo === 'contrato'
        ? `${this.base}/loans/${loanId}/pdf`
        : `${this.base}/loans/${loanId}/plan-pdf`;
    const filename =
      tipo === 'contrato'
        ? `contrato-${loanId.substring(0, 8)}.pdf`
        : `plan-pagos-${loanId.substring(0, 8)}.pdf`;

    this.descargando.set(true);
    try {
      const blob = await firstValueFrom(
        this.http.get(url, { responseType: 'blob' }),
      );
      const file = new File([blob], filename, { type: 'application/pdf' });

      const nav: any = navigator;

      // Web Share API con archivos (Android moderno lo soporta).
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: tipo === 'contrato' ? 'Contrato' : 'Plan de pagos',
          text: nombreCliente ? `Documento de ${nombreCliente}` : 'Documento del crédito',
        });
        return;
      }

      // Fallback: abrir el PDF y, aparte, WhatsApp con un mensaje.
      // (El usuario adjunta el archivo manualmente desde el visor.)
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

      if (telefono) {
        const tel = String(telefono).replace(/\D/g, '');
        const numero = tel.length === 10 ? `52${tel}` : tel;
        const texto = encodeURIComponent(
          `Le comparto su ${tipo === 'contrato' ? 'contrato' : 'plan de pagos'}.`,
        );
        window.open(`https://wa.me/${numero}?text=${texto}`, '_blank');
      }
    } finally {
      this.descargando.set(false);
    }
  }
}