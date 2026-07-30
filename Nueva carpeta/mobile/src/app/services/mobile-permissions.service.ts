import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../core/auth.service'; // ajusta la ruta a tu auth.service real

// ─── CÓDIGOS DE PERMISO MÓVIL ───────────────────────────────
// Estas claves deben existir en la tabla `permisos` (columna `clave`) del
// backend y asignarse a los roles desde la pantalla de roles del WEB.
// La app solo las LEE del login (user.permissions). El formato sigue la
// convención del sistema: modulo.accion en minúsculas (ej. cobranza.gestor).
export const MOBILE_PERMS = {
  REGISTRAR_PAGO:   'movil.registrar_pago',
  REGISTRAR_VISITA: 'movil.registrar_visita',
  PROMESA_PAGO:     'movil.promesa_pago',
  CONVENIO:         'movil.convenio',
  REESTRUCTURA:     'movil.reestructura',
} as const;

export type MobilePerm = typeof MOBILE_PERMS[keyof typeof MOBILE_PERMS];

// ─── SERVICIO DE PERMISOS MÓVIL ─────────────────────────────
// Envuelve el AuthService.can() que ya existe, exponiendo helpers legibles
// y signals reactivos para usar en plantillas. NO reimplementa la lógica:
// delega en can(), que ya maneja el caso admin (isAdmin => true).
@Injectable({ providedIn: 'root' })
export class MobilePermissionsService {
  private auth = inject(AuthService);

  /**
   * Verificación puntual. Devuelve true si el usuario tiene AL MENOS UNO de
   * los permisos indicados. Itera llamando a auth.can() con un solo argumento
   * por vez, para ser compatible con la firma del AuthService de la app móvil
   * (que recibe un único permiso, no una lista variádica).
   */
  can(...perms: MobilePerm[]): boolean {
    return perms.some((p) => this.auth.can(p));
  }

  // ── Helpers reactivos (signals) para usar directo en @if ──
  // Recalculan solos cuando cambia el usuario (login/logout).
  readonly puedeRegistrarPago   = computed(() => this.auth.can(MOBILE_PERMS.REGISTRAR_PAGO));
  readonly puedeRegistrarVisita = computed(() => this.auth.can(MOBILE_PERMS.REGISTRAR_VISITA));
  readonly puedePromesaPago     = computed(() => this.auth.can(MOBILE_PERMS.PROMESA_PAGO));
  readonly puedeConvenio        = computed(() => this.auth.can(MOBILE_PERMS.CONVENIO));
  readonly puedeReestructura    = computed(() => this.auth.can(MOBILE_PERMS.REESTRUCTURA));

  /** ¿Tiene alguna capacidad de gestor? (para mostrar/ocultar secciones enteras) */
  readonly esGestor = computed(() =>
    this.puedePromesaPago() || this.puedeConvenio() || this.puedeReestructura(),
  );
}