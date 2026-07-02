import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDividerModule } from "@angular/material/divider";
import { ApiService } from "../../core/index";

@Component({
  selector: "app-company-settings",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1><mat-icon>business</mat-icon> Datos de la empresa</h1>
    </div>

    <mat-card class="settings-card">
      <mat-card-content>
        @if (loading()) {
          <div class="loading-overlay">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        } @else {
          <form [formGroup]="form" (ngSubmit)="save()">
            <h3 class="section-title">Información general</h3>
            <div class="form-grid">
              <mat-form-field appearance="outline" class="col-span-2">
                <mat-label>Nombre de la empresa *</mat-label>
                <input matInput formControlName="name" />
                <mat-icon matPrefix>business</mat-icon>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>RFC</mat-label>
                <input
                  matInput
                  formControlName="rfc"
                  style="text-transform:uppercase"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Régimen fiscal</mat-label>
                <input matInput formControlName="fiscalRegime" />
              </mat-form-field>
            </div>

            <mat-divider class="divider"></mat-divider>
            <h3 class="section-title">Contacto</h3>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Teléfono</mat-label>
                <input matInput formControlName="phone" />
                <mat-icon matPrefix>phone</mat-icon>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput type="email" formControlName="email" />
                <mat-icon matPrefix>email</mat-icon>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Sitio web</mat-label>
                <input matInput formControlName="website" />
                <mat-icon matPrefix>language</mat-icon>
              </mat-form-field>
            </div>

            <mat-divider class="divider"></mat-divider>
            <h3 class="section-title">Domicilio fiscal</h3>
            <div class="form-grid">
              <mat-form-field appearance="outline" class="col-span-2">
                <mat-label>Calle y número</mat-label>
                <textarea
                  matInput
                  formControlName="address"
                  rows="2"
                ></textarea>
              </mat-form-field>

              <!-- Estado desde catálogo BD -->
              <mat-form-field appearance="outline">
                <mat-label>Estado</mat-label>
                <mat-select
                  formControlName="state"
                  (selectionChange)="onStateChange($event.value)"
                >
                  @if (loadingStates()) {
                    <mat-option disabled>Cargando...</mat-option>
                  }
                  @for (s of states(); track s.id) {
                    <mat-option [value]="s.name">{{ s.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <!-- Municipio/Ciudad desde catálogo BD -->
              <mat-form-field appearance="outline">
                <mat-label>Municipio / Ciudad</mat-label>
                <mat-select formControlName="city">
                  @if (loadingMunicipalities()) {
                    <mat-option disabled>Cargando...</mat-option>
                  } @else if (municipalities().length === 0) {
                    <mat-option value="" disabled
                      >Selecciona primero el estado</mat-option
                    >
                  }
                  @for (m of municipalities(); track m.id) {
                    <mat-option [value]="m.name">{{ m.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Código postal</mat-label>
                <input matInput formControlName="zip" maxlength="5" />
              </mat-form-field>
            </div>

            <mat-divider class="divider"></mat-divider>
            <h3 class="section-title">Documentos</h3>
            <mat-form-field appearance="outline" style="width:100%">
              <mat-label>Texto legal en comprobantes y contratos</mat-label>
              <textarea
                matInput
                formControlName="legalFooter"
                rows="8"
                style="min-height:140px;resize:vertical"
                placeholder="Ej: Este documento es un comprobante válido de operación financiera registrada ante las autoridades correspondientes..."
              >
              </textarea>
              <mat-hint
                >Aparece en el pie de página de todos los PDFs
                generados</mat-hint
              >
            </mat-form-field>

            <mat-divider class="divider"></mat-divider>

            <h3 class="section-title">Impresión</h3>

            <div class="form-grid">
              <mat-form-field appearance="outline" class="col-span-2">
                <mat-label>Impresora de tickets</mat-label>
                <mat-select formControlName="ticketPrinter">
                  @if (loadingPrinters()) {
                    <mat-option disabled>Cargando impresoras...</mat-option>
                  } @else if (printers().length === 0) {
                    <mat-option disabled
                      >No se encontraron impresoras</mat-option
                    >
                  }

                  @for (p of printers(); track p) {
                    <mat-option [value]="p">{{ p }}</mat-option>
                  }
                </mat-select>
                <mat-icon matPrefix>print</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Ancho del ticket</mat-label>
                <mat-select formControlName="ticketWidth">
                  <mat-option value="58">58 mm</mat-option>
                  <mat-option value="80">80 mm</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Corte automático</mat-label>
                <mat-select formControlName="autoCut">
                  <mat-option [value]="true">Sí</mat-option>
                  <mat-option [value]="false">No</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <div style="margin-top:8px">
              <button mat-stroked-button type="button" (click)="loadPrinters()">
                <mat-icon>refresh</mat-icon>
                Actualizar impresoras
              </button>
            </div>

            <div class="form-actions" style="margin-top:24px">
              <button
                mat-raised-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving()"
              >
                @if (saving()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <mat-icon>save</mat-icon>
                }
                Guardar cambios
              </button>
            </div>
          </form>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
      .col-span-2 {
        grid-column: 1 / -1;
      }
      .divider {
        margin: 20px 0 !important;
      }
    `,
  ],
})
export class CompanySettingsComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);
  states = signal<any[]>([]);
  municipalities = signal<any[]>([]);
  loadingStates = signal(false);
  loadingMunicipalities = signal(false);
  printers = signal<string[]>([]);
  loadingPrinters = signal(false);

  form = this.fb.group({
    name: ["", Validators.required],
    rfc: [""],
    fiscalRegime: [""],
    phone: [""],
    email: ["", Validators.email],
    website: [""],
    address: [""],
    city: [""],
    state: [""],
    zip: [""],
    legalFooter: [""],
    ticketPrinter: [""],
    ticketWidth: ["80"],
    autoCut: [true],
  });

  ngOnInit() {
    this.loadStates();
    this.loadPrinters();
    this.api.get<any>("/company").subscribe({
      next: (data) => {
        this.form.patchValue(data);
        // Si hay estado guardado, cargar sus municipios
        if (data?.state) this.loadMunicipalitiesByName(data.state);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadStates() {
    this.loadingStates.set(true);
    this.api.get<any[]>("/locations/states").subscribe({
      next: (r) => {
        this.states.set(Array.isArray(r) ? r : ((r as any)?.data ?? []));
        this.loadingStates.set(false);
      },
      error: () => this.loadingStates.set(false),
    });
  }

  loadPrinters() {
    this.loadingPrinters.set(true);

    this.api.get<any>("/printing/printers").subscribe({
      next: (r) => {
        const printers = Array.isArray(r) ? r : (r?.data ?? []);
        this.printers.set(printers);
        this.loadingPrinters.set(false);
      },
      error: () => {
        this.snackbar.open("No se pudieron cargar las impresoras", "Cerrar", {
          duration: 4000,
        });
        this.loadingPrinters.set(false);
      },
    });
  }

  onStateChange(stateName: string) {
    this.municipalities.set([]);
    this.form.patchValue({ city: "" });
    this.loadMunicipalitiesByName(stateName);
  }

  loadMunicipalitiesByName(stateName: string) {
    const state = this.states().find((s) => s.name === stateName);
    if (!state) return;
    this.loadingMunicipalities.set(true);
    this.api
      .get<any[]>(`/locations/states/${state.id}/municipalities`)
      .subscribe({
        next: (r) => {
          this.municipalities.set(
            Array.isArray(r) ? r : ((r as any)?.data ?? []),
          );
          this.loadingMunicipalities.set(false);
        },
        error: () => this.loadingMunicipalities.set(false),
      });
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.put<any>("/company", this.form.value).subscribe({
      next: () => {
        this.snackbar.open("Datos guardados correctamente", "OK", {
          duration: 3000,
        });
        this.saving.set(false);
      },
      error: () => {
        this.snackbar.open("Error al guardar", "Cerrar", { duration: 4000 });
        this.saving.set(false);
      },
    });
  }
}
