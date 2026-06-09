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

// Cliente/crédito asignado al cobrador
export interface AssignedClient {
  loanId: string;
  customerId: string;
  customerName: string;
  phone?: string;
  address?: string;
  principalAmount: number;
  periodicPayment: number;
  status: string;            // ACTIVO | VENCIDO | ...
  estado: 'corriente' | 'vencido';
  saldoPendiente?: number;
  moraPendiente?: number;
  proximaCuota?: { periodo: number; vence: string; monto: number } | null;
}

export type PaymentType = 'DIA' | 'TOTAL' | 'MORATORIO';
export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEPOSITO';

// Pago capturado en el móvil (puede estar pendiente de sincronizar)
export interface LocalPayment {
  localId: string;           // uuid generado en el móvil (idempotencia)
  loanId: string;
  amountPaid: number;
  paymentType: PaymentType;
  method: PaymentMethod;
  applyExcedenteToMora?: boolean;
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
}

export interface PaymentInfo {
  cuotaDiaria: number;
  saldoPendiente: number;
  moraPendiente: number;
  moraPorDia: number;
  totalDiasMora: number;
  proximaCuota?: { periodo: number; vence: string; monto: number } | null;
}
