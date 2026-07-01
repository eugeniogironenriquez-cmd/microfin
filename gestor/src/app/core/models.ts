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

// Simulación de reestructura (POST /loans/simulate)
export interface SimulacionResponse {
  periodicPayment: number;
  totalAmount: number;
  schedule?: Array<{
    periodNumber: number;
    dueDate: string;
    totalDue: number;
  }>;
}
