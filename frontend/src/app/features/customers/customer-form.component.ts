import { Component, OnInit, AfterViewChecked, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService, Customer } from '../../core/index';

const GIROS = [
  'Comercio al por menor','Comercio al por mayor','Alimentos y bebidas',
  'Servicios personales','Servicios profesionales','Transporte',
  'Construcción','Manufactura / Taller','Agropecuario',
  'Educación','Salud','Tecnología','Otro',
];

@Component({
  selector: 'app-customer-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule, MatDividerModule,
  ],
  template: `
    <div class="page-header">
      <h1>
        <mat-icon>{{ isEdit() ? 'edit' : 'person_add' }}</mat-icon>
        {{ isEdit() ? 'Editar cliente' : 'Nuevo cliente' }}
      </h1>
      <a mat-stroked-button routerLink="/customers">
        <mat-icon>arrow_back</mat-icon> Regresar
      </a>
    </div>

    <mat-card>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="save()">

          <!-- ── FOTO ───────────────────────────────── -->
          <h3 class="section-title">Foto del cliente</h3>
          <div class="photo-section">
            <div class="photo-preview-box">
              @if (photoPreview()) {
                <img [src]="photoPreview()!" alt="Foto" class="photo-preview-img">
              } @else {
                <div class="photo-placeholder">
                  <mat-icon>person</mat-icon>
                  <span>Sin foto</span>
                </div>
              }
            </div>
            <div class="photo-buttons">
              <button mat-stroked-button type="button" (click)="fileInput.click()">
                <mat-icon>upload</mat-icon> Subir imagen
              </button>
              <input #fileInput type="file" accept="image/*"
                     style="display:none" (change)="onFileSelected($event)">
              <button mat-stroked-button type="button" (click)="toggleCamera()">
                <mat-icon>{{ cameraActive() ? 'camera_off' : 'camera_alt' }}</mat-icon>
                {{ cameraActive() ? 'Cerrar cámara' : 'Usar cámara' }}
              </button>
              @if (photoPreview()) {
                <button mat-icon-button type="button" color="warn"
                        matTooltip="Eliminar foto" (click)="removePhoto()">
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </div>
          </div>
          @if (cameraActive()) {
            <div class="camera-wrap">
              <video #videoEl autoplay playsinline class="camera-video"></video>
              <button mat-raised-button color="primary" type="button"
                      (click)="capturePhoto()">
                <mat-icon>camera</mat-icon> Capturar foto
              </button>
            </div>
            <canvas #canvasEl style="display:none"></canvas>
          }

          <mat-divider class="my-divider"></mat-divider>

          <!-- ── DATOS PERSONALES ───────────────────── -->
          <h3 class="section-title">Datos personales</h3>
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Nombre completo *</mat-label>
              <input matInput formControlName="fullName" placeholder="Juan García López">
              <mat-error>Campo requerido</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>CURP *</mat-label>
              <input matInput formControlName="curp" placeholder="GARL900101HMCRCN01"
                     style="text-transform:uppercase">
              <mat-error>CURP inválida</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>RFC</mat-label>
              <input matInput formControlName="rfc" placeholder="GARL900101ABC"
                     style="text-transform:uppercase">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Teléfono *</mat-label>
              <input matInput formControlName="phone" placeholder="5512345678" maxlength="10">
              <mat-error>10 dígitos requeridos</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Correo electrónico</mat-label>
              <input matInput type="email" formControlName="email">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Fecha de nacimiento</mat-label>
              <input matInput type="date" formControlName="birthDate">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Ocupación</mat-label>
              <input matInput formControlName="occupation">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Giro del negocio</mat-label>
              <mat-select formControlName="businessType" (selectionChange)="onGiroChange()">
                <mat-option value="">Sin giro registrado</mat-option>
                @for (g of giros; track g) {
                  <mat-option [value]="g">{{ g }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            @if (form.value.businessType === 'Otro') {
              <mat-form-field appearance="outline">
                <mat-label>Especifica el giro *</mat-label>
                <input matInput formControlName="businessTypeOther"
                       placeholder="Describe el giro del negocio">
              </mat-form-field>
            }

            <mat-form-field appearance="outline">
              <mat-label>Ingreso mensual estimado</mat-label>
              <input matInput type="number" formControlName="monthlyIncome">
              <span matPrefix>$&nbsp;</span>
            </mat-form-field>
          </div>

          <mat-divider class="my-divider"></mat-divider>

          <!-- ── DOMICILIO ──────────────────────────── -->
          <h3 class="section-title">Domicilio</h3>
          <div class="form-grid" formGroupName="address">
            <mat-form-field appearance="outline" class="col-span-2">
              <mat-label>Calle y número</mat-label>
              <input matInput formControlName="street" placeholder="Av. Juárez 123">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Colonia</mat-label>
              <input matInput formControlName="colonia">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Estado</mat-label>
              <mat-select formControlName="state"
                          (selectionChange)="onStateChange($event.value)">
                @if (loadingStates()) {
                  <mat-option disabled>Cargando...</mat-option>
                }
                @for (s of states(); track s.id) {
                  <mat-option [value]="s.name">{{ s.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Municipio / Alcaldía</mat-label>
              <mat-select formControlName="municipality">
                @if (loadingMunicipalities()) {
                  <mat-option disabled>Cargando...</mat-option>
                } @else if (municipalities().length === 0) {
                  <mat-option value="" disabled>Selecciona primero el estado</mat-option>
                }
                @for (m of municipalities(); track m.id) {
                  <mat-option [value]="m.name">{{ m.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Código postal</mat-label>
              <input matInput formControlName="zip" maxlength="5">
            </mat-form-field>

            <mat-form-field appearance="outline" class="col-span-2">
              <mat-label>Referencias</mat-label>
              <input matInput formControlName="references"
                     placeholder="Entre calles, color de fachada...">
            </mat-form-field>
          </div>

          <mat-divider class="my-divider"></mat-divider>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Observaciones</mat-label>
            <textarea matInput formControlName="notes" rows="3"
                      placeholder="Información adicional del cliente..."></textarea>
          </mat-form-field>

          <div class="form-actions">
            <a mat-stroked-button routerLink="/customers">Cancelar</a>
            <button mat-raised-button color="primary" type="submit"
                    [disabled]="form.invalid || saving()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { <mat-icon>save</mat-icon> }
              {{ isEdit() ? 'Guardar cambios' : 'Registrar cliente' }}
            </button>
          </div>

        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .photo-section {
      display:flex; align-items:flex-start; gap:20px;
      margin-bottom:16px; flex-wrap:wrap;
    }
    .photo-preview-box {
      width:130px; height:150px; border-radius:10px;
      border:2px dashed #CBD5E0; overflow:hidden;
      display:flex; align-items:center; justify-content:center;
      background:#F4F7FE; flex-shrink:0;
    }
    .photo-preview-img { width:100%; height:100%; object-fit:cover; }
    .photo-placeholder {
      display:flex; flex-direction:column; align-items:center;
      gap:4px; color:#A0AEC0; font-size:12px;
    }
    .photo-placeholder mat-icon { font-size:40px; width:40px; height:40px; opacity:.4; }
    .photo-buttons { display:flex; flex-direction:column; gap:8px; }
    .camera-wrap {
      display:flex; align-items:flex-start; gap:12px;
      margin-bottom:16px; flex-wrap:wrap;
    }
    .camera-video {
      width:300px; height:225px; border-radius:10px;
      border:2px solid #1C4532; object-fit:cover;
    }
    .col-span-2 { grid-column:1 / -1; }
    .my-divider { margin:20px 0 !important; }
    .w-full { width:100%; }
  `],
})
export class CustomerFormComponent implements OnInit, AfterViewChecked {
  private api      = inject(ApiService);
  private http     = inject(HttpClient);
  private route    = inject(ActivatedRoute);
  private router   = inject(Router);
  private fb       = inject(FormBuilder);
  private snackbar = inject(MatSnackBar);

  isEdit             = signal(false);
  saving             = signal(false);
  photoPreview       = signal<string | null>(null);
  cameraActive       = signal(false);
  states             = signal<any[]>([]);
  municipalities     = signal<any[]>([]);
  loadingStates      = signal(false);
  loadingMunicipalities = signal(false);

  @ViewChild('videoEl') videoElRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasElRef?: ElementRef<HTMLCanvasElement>;

  private photoFile: File | null = null;
  private videoStream: MediaStream | null = null;
  private streamAttached = false;
  giros = GIROS;

  form = this.fb.group({
    fullName:         ['', Validators.required],
    curp:             ['', [Validators.required,
                       Validators.pattern(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/)]],
    rfc:              [''],
    phone:            ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    email:            ['', Validators.email],
    birthDate:        [''],
    occupation:       [''],
    businessType:     [''],
    businessTypeOther:[''],
    monthlyIncome:    [null as number | null],
    notes:            [''],
    address: this.fb.group({
      street:      [''],
      colonia:     [''],
      municipality:[''],
      state:       [''],
      zip:         [''],
      references:  [''],
    }),
  });

  ngOnInit() {
    this.loadStates();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.api.get<Customer>(`/customers/${id}`).subscribe((c) => {
        this.form.patchValue(c as any);
        const state = (c as any).address?.state;
        if (state) this.loadMunicipalities(state);
        if ((c as any).photoPath) {
          this.loadPhotoAuthenticated(id);
        }
      });
    }
  }

  loadStates() {
    this.loadingStates.set(true);
    this.api.get<any[]>('/locations/states').subscribe({
      next: (data) => { this.states.set(data); this.loadingStates.set(false); },
      error: () => this.loadingStates.set(false),
    });
  }

  onStateChange(stateName: string) {
    this.municipalities.set([]);
    this.form.get('address.municipality')?.setValue('');
    if (!stateName) return;
    // Buscar el id del estado por nombre
    const state = this.states().find(s => s.name === stateName);
    if (state) this.loadMunicipalities(stateName, state.id);
  }

  loadMunicipalities(stateName: string, stateId?: number) {
    // Si no tenemos el id, buscarlo
    const id = stateId ?? this.states().find(s => s.name === stateName)?.id;
    if (!id) return;
    this.loadingMunicipalities.set(true);
    this.api.get<any[]>(`/locations/states/${id}/municipalities`).subscribe({
      next: (data) => { this.municipalities.set(data); this.loadingMunicipalities.set(false); },
      error: () => this.loadingMunicipalities.set(false),
    });
  }

  onGiroChange() {
    if (this.form.value.businessType !== 'Otro') {
      this.form.patchValue({ businessTypeOther: '' });
    }
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.photoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.photoPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removePhoto() { this.photoPreview.set(null); this.photoFile = null; }

  async toggleCamera() {
    if (this.cameraActive()) { this.stopCamera(); return; }
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia(
        { video: { facingMode: 'user', width: 640, height: 480 } }
      );
      this.streamAttached = false;
      this.cameraActive.set(true);
      // srcObject se asigna en ngAfterViewChecked cuando el <video> ya existe en el DOM
    } catch {
      this.snackbar.open('No se pudo acceder a la cámara', 'Cerrar', { duration: 4000 });
    }
  }

  ngAfterViewChecked() {
    // Asigna el stream al elemento <video> en cuanto Angular lo renderice
    if (this.cameraActive() && this.videoStream && !this.streamAttached && this.videoElRef) {
      this.videoElRef.nativeElement.srcObject = this.videoStream;
      this.videoElRef.nativeElement.play().catch(() => {});
      this.streamAttached = true;
    }
  }

  capturePhoto() {
    const video  = this.videoElRef?.nativeElement;
    const canvas = this.canvasElRef?.nativeElement;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      this.photoFile = new File([blob], 'foto-cliente.jpg', { type: 'image/jpeg' });
      this.photoPreview.set(canvas.toDataURL('image/jpeg', 0.9));
      this.stopCamera();
    }, 'image/jpeg', 0.9);
  }

  stopCamera() {
    this.videoStream?.getTracks().forEach(t => t.stop());
    this.videoStream = null;
    this.streamAttached = false;
    this.cameraActive.set(false);
  }

  private loadPhotoAuthenticated(customerId: string) {
    const token = localStorage.getItem('access_token');
    this.http.get(`/api/v1/customers/${customerId}/photo`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.photoPreview.set(url);
      },
      error: () => {}, // sin foto, no mostrar nada
    });
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const id = this.route.snapshot.paramMap.get('id');
    const req = id
      ? this.api.put<Customer>(`/customers/${id}`, this.form.value)
      : this.api.post<Customer>('/customers', this.form.value);

    req.subscribe({
      next: async (c) => {
        if (this.photoFile) await this.uploadPhoto(c.id);
        this.snackbar.open(
          this.isEdit() ? 'Cliente actualizado' : 'Cliente registrado',
          'OK', { duration: 4000 }
        );
        this.router.navigate(['/customers', c.id]);
      },
      error: (err) => {
        this.snackbar.open(err.error?.message?.[0] || 'Error al guardar', 'Cerrar', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  private uploadPhoto(customerId: string): Promise<void> {
    if (!this.photoFile) return Promise.resolve();
    const formData = new FormData();
    formData.append('photo', this.photoFile);
    const token = localStorage.getItem('access_token');
    return new Promise((resolve) => {
      this.http.post(
        `/api/v1/customers/${customerId}/photo`, formData,
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
      ).subscribe({ next: () => resolve(), error: () => resolve() });
    });
  }
}