import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/index';

@Component({
  selector: 'app-import-loans',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTableModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>upload_file</mat-icon> Cargar créditos anteriores</h1>
    </div>

    <mat-card>
      <mat-card-content>
        <div class="info-box">
          <mat-icon>info</mat-icon>
          <div>
            <strong>Carga masiva de créditos del sistema anterior</strong>
            <p>Sube el archivo Excel con el layout proporcionado. Cada fila debe tener la CURP de un
               cliente ya registrado. El sistema creará los créditos como ACTIVOS y generará su
               calendario, marcando como pagadas las cuotas ya cubiertas.</p>
          </div>
        </div>

        <div class="upload-zone">
          <input #fileInput type="file" accept=".xlsx,.xls" hidden
                 (change)="onFileSelected($event)">
          <mat-icon class="upload-icon">cloud_upload</mat-icon>
          @if (fileName()) {
            <p class="file-name"><mat-icon>description</mat-icon> {{ fileName() }}</p>
          } @else {
            <p>Selecciona el archivo Excel a cargar</p>
          }
          <button mat-stroked-button color="primary" (click)="fileInput.click()" [disabled]="uploading()">
            <mat-icon>folder_open</mat-icon> Elegir archivo
          </button>
        </div>

        @if (selectedFile()) {
          <div class="actions">
            <button mat-raised-button color="primary" (click)="upload()" [disabled]="uploading()">
              @if (uploading()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>upload</mat-icon> }
              Cargar créditos
            </button>
          </div>
        }

        @if (result()) {
          <div class="result-box">
            <div class="result-summary">
              <div class="res-stat ok">
                <span class="res-num">{{ result()!.creados }}</span>
                <span class="res-lbl">créditos creados</span>
              </div>
              <div class="res-stat err" [class.zero]="result()!.errores.length === 0">
                <span class="res-num">{{ result()!.errores.length }}</span>
                <span class="res-lbl">con error</span>
              </div>
            </div>

            @if (result()!.errores.length > 0) {
              <h4>Filas con problemas</h4>
              <table mat-table [dataSource]="result()!.errores" class="err-table">
                <ng-container matColumnDef="fila">
                  <th mat-header-cell *matHeaderCellDef>Fila</th>
                  <td mat-cell *matCellDef="let e">{{ e.fila }}</td>
                </ng-container>
                <ng-container matColumnDef="error">
                  <th mat-header-cell *matHeaderCellDef>Error</th>
                  <td mat-cell *matCellDef="let e">{{ e.error }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['fila','error']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['fila','error'];"></tr>
              </table>
            }
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .info-box {
      display:flex; gap:12px; align-items:flex-start;
      background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px;
      padding:14px; margin-bottom:20px;
    }
    .info-box mat-icon { color:#2563EB; }
    .info-box strong { color:#1E40AF; }
    .info-box p { margin:4px 0 0; font-size:13px; color:#1E40AF; }
    .upload-zone {
      border:2px dashed #CBD5E0; border-radius:12px; padding:32px;
      text-align:center; display:flex; flex-direction:column; align-items:center; gap:10px;
    }
    .upload-icon { font-size:48px; width:48px; height:48px; color:#A0AEC0; }
    .file-name { display:flex; align-items:center; gap:6px; font-weight:600; color:#1C4532; }
    .file-name mat-icon { font-size:18px; width:18px; height:18px; }
    .actions { display:flex; justify-content:center; margin-top:20px; }
    .result-box { margin-top:24px; }
    .result-summary { display:flex; gap:24px; justify-content:center; margin-bottom:20px; }
    .res-stat { display:flex; flex-direction:column; align-items:center; padding:16px 28px; border-radius:12px; }
    .res-stat.ok { background:#F0FFF4; }
    .res-stat.err { background:#FEF2F2; }
    .res-stat.err.zero { background:#F7FAFC; }
    .res-num { font-size:32px; font-weight:700; }
    .res-stat.ok .res-num { color:#16A34A; }
    .res-stat.err .res-num { color:#DC2626; }
    .res-stat.err.zero .res-num { color:#A0AEC0; }
    .res-lbl { font-size:12px; color:#718096; }
    .err-table { width:100%; margin-top:8px; }
  `],
})
export class ImportLoansComponent {
  private api = inject(ApiService);
  private snackbar = inject(MatSnackBar);

  selectedFile = signal<File | null>(null);
  fileName = signal('');
  uploading = signal(false);
  result = signal<any>(null);

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.selectedFile.set(file);
      this.fileName.set(file.name);
      this.result.set(null);
    }
  }

  upload() {
    const file = this.selectedFile();
    if (!file) return;
    this.uploading.set(true);
    const formData = new FormData();
    formData.append('file', file);

    this.api.post<any>('/import/loans', formData).subscribe({
      next: (r) => {
        this.result.set(r);
        this.uploading.set(false);
        this.snackbar.open(`${r.creados} créditos cargados`, 'OK', { duration: 4000 });
      },
      error: (err) => {
        this.snackbar.open(err.error?.message || 'Error al cargar', 'Cerrar', { duration: 5000 });
        this.uploading.set(false);
      },
    });
  }
}