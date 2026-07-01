// ─── MODELOS COMPARTIDOS ─────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  roleName?: string;
  isAdmin?: boolean;
  permissions?: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface Empresa {
  nombre: string;
  rfc?: string;
  domicilio?: string;
  telefono?: string;
  correo?: string;
  sitioWeb?: string;
  regimenFiscal?: string;
  ciudad?: string;
  estado?: string;
  codigoPostal?: string;
  pieLegal?: string;   // avisos del ticket (puede traer varias líneas con \n)
}

export interface CustomerAddress {
  street?: string;
  colonia?: string;
  municipality?: string;
  state?: string;
  zip?: string;
  references?: string;
}
 
export interface AssignedClient {
  loanId: string;
  customerId: string;
  customerName: string;
  phone?: string;
  curp?: string;                    // útil para mostrar/ticket
  address?: string;                 // calle (compat: lo que ya usabas)
  addressFull?: CustomerAddress;    // domicilio completo (nuevo)
  addressLine?: string;             // domicilio en una sola línea, listo para mostrar
  principalAmount: number;
  periodicPayment: number;
  termWeeks?: number;               // total de cuotas del plazo (para el ticket)
  status: string;            // ACTIVO | ATRASADO | VENCIDO | ...
  estado: 'corriente' | 'atrasado' | 'vencido';   // 3 estados (incluye atrasado)
  saldoPendiente?: number;
  moraPendiente?: number;
  proximaCuota?: { periodo: number; vence: string; monto: number } | null;
  cuotasVencidas?: number;
 nivel?: 'VERDE' | 'AMARILLO' | 'ROJO';
}

export type PaymentType = 'DIA' | 'TOTAL' | 'MORATORIO';
export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO';

export interface TicketSnapshot {
  // Datos del crédito al momento del pago
  principalAmount: number;       // Monto del crédito
  periodicPayment: number;       // Cuota
  saldoPendiente: number;        // Saldo tras el pago (o el que se tenía)
  // Progreso
  totalCuotas: number;           // Total de cuotas del plazo
  cuotaActual: number;           // Nº de la cuota pagada (para "28/30")
  cuotasPendientes: number;      // Cuántas quedan
  // Cuotas cubiertas en esta transacción, con su fecha de vencimiento
  cuotasPagadas: Array<{ periodo: number; fecha?: string }>;
  // Mora cobrada en esta transacción (0 si no aplica)
  mora: number;
}

// Pago capturado en el móvil (puede estar pendiente de sincronizar)
export interface LocalPayment {
  localId: string;           // uuid generado en el móvil (idempotencia)
  loanId: string;
  amountPaid: number;
  paymentType: PaymentType;
  method: PaymentMethod;
  applyExcedenteToMora?: boolean;
  periodos?: number[];       // cuotas específicas marcadas (modo selectivo)
  notes?: string;
  // Geolocalización capturada al registrar
  lat?: number;
  lng?: number;
  // Control de sincronización
  capturedAt: string;        // ISO
  synced: boolean;
  syncedAt?: string;
  serverId?: string;         // id del pago en el servidor tras sincronizar
  receiptNumber?: string;
  error?: string;
  snapshot?: TicketSnapshot;   // ← AGREGAR
}

export interface PaymentInfo {
  cuotaDiaria: number;
  saldoPendiente: number;
  moraPendiente: number;
  moraPorDia: number;
  totalDiasMora: number;
  proximaCuota?: { periodo: number; vence: string; monto: number } | null;
}

// Cuota pendiente para el modo selectivo (marcar cuáles paga)
export interface CuotaPendiente {
  periodo: number;
  vence: string;
  monto: number;
  estatus: string;
  vencida: boolean;
  mora: number;
}

// ── Visitas ──────────────────────────────────────────────────
export type TipoVisita = 'NO_LOCALIZADO' | 'PROMESA_PAGO';

export interface LocalVisit {
  localId: string;
  loanId: string;
  tipo: TipoVisita;
  notas?: string;
  fechaPromesa?: string;   // 'YYYY-MM-DD' (solo PROMESA_PAGO)
  montoPromesa?: number;   // solo PROMESA_PAGO
  lat?: number;
  lng?: number;
  capturedAt: string;
  synced: boolean;
  syncedAt?: string;
  serverId?: string;
  error?: string;
}

// ── Acciones de gestor (reestructura / convenio) ─────────────
export type GestorAccionTipo = 'REESTRUCTURA' | 'CONVENIO';

export interface LocalGestorAccion {
  localId: string;
  loanId: string;
  tipo: GestorAccionTipo;
  // Reestructura: principalAmount, days, customPayment, restructureReason
  // Convenio: montoConvenio, numeroPagos, periodicidad, fechaPrimerPago, notes
  payload: Record<string, any>;
  capturedAt: string;
  synced: boolean;
  syncedAt?: string;
  serverId?: string;
  error?: string;
}
