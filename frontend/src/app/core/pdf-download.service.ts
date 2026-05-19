import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class PdfDownloadService {
  private readonly base = '/api/v1';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  /** Descarga PDF via GET con token JWT */
  download(path: string, filename: string): void {
    this.http.get(`${this.base}${path}`, {
      headers: this.getHeaders(),
      responseType: 'blob',
    }).subscribe({
      next: (blob) => this.saveBlob(blob, filename),
      error: (err) => console.error('Error descargando PDF:', err),
    });
  }

  /** Descarga PDF via POST con body y token JWT */
  downloadPost(path: string, filename: string, body: any): void {
    this.http.post(`${this.base}${path}`, body, {
      headers: this.getHeaders(),
      responseType: 'blob',
    }).subscribe({
      next: (blob) => this.saveBlob(blob, filename),
      error: (err) => console.error('Error descargando PDF:', err),
    });
  }

  /** Abre PDF en nueva pestaña via GET */
  open(path: string): void {
    this.http.get(`${this.base}${path}`, {
      headers: this.getHeaders(),
      responseType: 'blob',
    }).subscribe({
      next: (blob) => this.openBlob(blob),
      error: (err) => console.error('Error abriendo PDF:', err),
    });
  }

  /** Abre PDF en nueva pestaña via POST */
  openPost(path: string, body: any): void {
    this.http.post(`${this.base}${path}`, body, {
      headers: this.getHeaders(),
      responseType: 'blob',
    }).subscribe({
      next: (blob) => this.openBlob(blob),
      error: (err) => console.error('Error abriendo PDF:', err),
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private openBlob(blob: Blob): void {
    const url = window.URL.createObjectURL(
      new Blob([blob], { type: 'application/pdf' })
    );
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 30000);
  }
}
