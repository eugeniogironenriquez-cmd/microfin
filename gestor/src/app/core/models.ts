// ─── MODELOS ─────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  roleName?: string;
  isAdmin?: boolean;
  permissions?: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

// Nivel del semáforo
export type NivelSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

// Fila del monitor de cartera (un crédito con su nivel de semáforo).
// Los nombres reflejan lo que devuelve GET /semaforo/monitor; si el backend
// usa otros, se ajusta el mapeo en SemaforoService.
export interface CreditoSemaforo {
  loanId: string;
  customerId: string;
  customerName: string;
  phone?: string;
  nivel: NivelSemaforo;
  cuotasVencidas: number;
  saldoPendiente?: number;
  moraPendiente?: number;
  periodicPayment?: number;
  principalAmount?: number;
  status?: string;
}

export interface MonitorResumen {
  verde: number;
  amarillo: number;
  rojo: number;
  total: number;
}

export interface MonitorResponse {
  resumen?: MonitorResumen;
  creditos: CreditoSemaforo[];
}

// Config de umbrales del semáforo
export interface ConfigSemaforo {
  greenUpTo: number;   // hasta cuántas cuotas vencidas es verde (0)
  yellowUpTo: number;  // hasta cuántas es amarillo (5); más es rojo
}

// Historial de comportamiento de un cliente
export interface HistorialResumen {
  totalEventos: number;
  vecesRojo: number;
  vecesAmarillo: number;
  maxCuotasVencidas: number;
  tieneProblemas: boolean;
}

export interface HistorialEvento {
  id: string;
  level: NivelSemaforo;
  overdueCount: number;
  recordedAt: string;
}

export interface HistorialResponse {
  resumen: HistorialResumen;
  eventos: HistorialEvento[];
}

// Dirección del cliente (viene como objeto en el backend)
export interface DireccionCliente {
  street?: string;
  colonia?: string;
  municipality?: string;
  state?: string;
  zip?: string;
  references?: string;
}

// Cliente completo (de GET /loans/:id → customer)
export interface ClienteDetalle {
  id: string;
  fullName: string;
  curp?: string;
  rfc?: string;
  phone?: string;
  email?: string;
  address?: DireccionCliente | string;
  occupation?: string;
}

// Aval (de GET /loans/:id/guarantor)
export interface Aval {
  fullName: string;
  curp?: string;
  rfc?: string;
  phone?: string;
  email?: string;
  address?: string;
  relationship?: string;
  occupation?: string;
}

// Simulación de reestructura (POST /loans/simulate)
export interface SimulacionResponse {
  periodicPayment: number;
  totalPayment: number;
  totalInterest: number;
  minPayment: number;
  percentage: number;
  days: number;
  schedule?: Array<{
    period: number;
    dueDate: string;
    payment: number;
  }>;
}