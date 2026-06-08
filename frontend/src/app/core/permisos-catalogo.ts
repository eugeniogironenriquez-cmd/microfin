// ============================================================
// CATÁLOGO DE PERMISOS DEL SISTEMA
// Organizado por módulo. Cada permiso = clave.accion
// ============================================================

export interface PermisoDef {
  key: string;        // clientes.crear
  module: string;     // Clientes
  action: string;     // Crear
  description: string;
}

export const PERMISOS_CATALOGO: PermisoDef[] = [
  // ── DASHBOARD ──
  { key: 'dashboard.ver', module: 'Dashboard', action: 'Ver', description: 'Acceder al panel principal' },

  // ── CARTERA ──
  { key: 'cartera.ver', module: 'Cartera', action: 'Ver', description: 'Ver la cartera de créditos' },
  { key: 'cartera.semaforo', module: 'Cartera', action: 'Semáforo', description: 'Ver el monitor de semáforo de cartera' },

  // ── CLIENTES ──
  { key: 'clientes.ver',     module: 'Clientes', action: 'Ver',     description: 'Ver lista y detalle de clientes' },
  { key: 'clientes.crear',   module: 'Clientes', action: 'Crear',   description: 'Registrar nuevos clientes' },
  { key: 'clientes.editar',  module: 'Clientes', action: 'Editar',  description: 'Modificar datos de clientes' },
  { key: 'clientes.eliminar',module: 'Clientes', action: 'Eliminar',description: 'Cambiar estatus / inactivar clientes' },

  // ── PRÉSTAMOS ──
  { key: 'prestamos.ver',        module: 'Préstamos', action: 'Ver',        description: 'Ver lista y detalle de préstamos' },
  { key: 'prestamos.crear',      module: 'Préstamos', action: 'Crear',      description: 'Crear solicitudes de crédito' },
  { key: 'prestamos.autorizar',  module: 'Préstamos', action: 'Autorizar',  description: 'Autorizar o rechazar solicitudes' },
  { key: 'prestamos.desembolsar',module: 'Préstamos', action: 'Desembolsar',description: 'Desembolsar créditos autorizados' },
  { key: 'prestamos.reestructurar', module: 'Préstamos', action: 'Reestructurar', description: 'Reestructurar créditos' },

  // ── PAGOS ──
  { key: 'pagos.ver',      module: 'Pagos', action: 'Ver',      description: 'Ver pagos' },
  { key: 'pagos.registrar',module: 'Pagos', action: 'Registrar',description: 'Registrar pagos de créditos' },
  { key: 'pagos.monitor',  module: 'Pagos', action: 'Monitor',  description: 'Ver el monitor de pagos del día' },

  // ── COBRANZA ──
  { key: 'cobranza.ver',     module: 'Cobranza', action: 'Ver',     description: 'Ver cartera de cobranza' },
  { key: 'cobranza.asignar', module: 'Cobranza', action: 'Asignar', description: 'Asignar cobradores a créditos' },
  { key: 'cobranza.gestor',  module: 'Cobranza', action: 'Gestor',  description: 'Acceder a la gestión de créditos en situación crítica (rojos)' },

  // ── CAJA ──
  { key: 'caja.ver',   module: 'Caja', action: 'Ver',   description: 'Ver el módulo de caja' },
  { key: 'caja.operar',module: 'Caja', action: 'Operar',description: 'Abrir y cerrar caja' },

  // ── GASTOS ──
  { key: 'gastos.ver',     module: 'Gastos', action: 'Ver',     description: 'Ver gastos operativos' },
  { key: 'gastos.registrar',module: 'Gastos', action: 'Registrar',description: 'Registrar gastos' },

  // ── REPORTES ──
  { key: 'reportes.ver',      module: 'Reportes', action: 'Ver',      description: 'Ver reportes' },
  { key: 'reportes.ubicacion',module: 'Reportes', action: 'Ubicación',description: 'Ver reporte de ubicación' },

  // ── CONFIGURACIÓN ──
  { key: 'config.ver',      module: 'Configuración', action: 'Ver',      description: 'Ver configuración del sistema' },
  { key: 'config.editar',   module: 'Configuración', action: 'Editar',   description: 'Modificar tipos de crédito, plazos, mora y semáforo' },
  { key: 'empresa.editar',  module: 'Configuración', action: 'Empresa',  description: 'Editar datos de la empresa' },
  { key: 'moratorios.editar',module: 'Configuración', action: 'Moratorios',description: 'Configurar reglas de moratorio' },

  // ── USUARIOS Y ROLES ──
  { key: 'usuarios.ver',   module: 'Usuarios', action: 'Ver',   description: 'Ver lista de usuarios' },
  { key: 'usuarios.crear', module: 'Usuarios', action: 'Crear', description: 'Crear y editar usuarios' },
  { key: 'roles.ver',      module: 'Roles', action: 'Ver',    description: 'Ver roles y permisos' },
  { key: 'roles.gestionar',module: 'Roles', action: 'Gestionar', description: 'Crear, editar y asignar permisos a roles' },
];

// Permisos por defecto de cada rol base
export const PERMISOS_POR_ROL: Record<string, string[]> = {
  ADMIN: PERMISOS_CATALOGO.map(p => p.key), // TODOS

  CAJERO: [
    'dashboard.ver', 'cartera.ver', 'cartera.semaforo',
    'clientes.ver', 'clientes.crear', 'clientes.editar',
    'prestamos.ver', 'prestamos.crear', 'prestamos.desembolsar',
    'pagos.ver', 'pagos.registrar', 'pagos.monitor',
    'cobranza.ver', 'cobranza.asignar',
    'caja.ver', 'caja.operar',
    'gastos.ver', 'gastos.registrar',
    'reportes.ver', 'reportes.ubicacion',
  ],

  AUTORIZADOR: [
    'dashboard.ver', 'cartera.ver', 'cartera.semaforo',
    'clientes.ver', 'clientes.crear', 'clientes.editar',
    'prestamos.ver', 'prestamos.crear', 'prestamos.autorizar', 'prestamos.reestructurar',
    'pagos.ver', 'pagos.registrar',
    'cobranza.ver',
    'reportes.ver', 'reportes.ubicacion',
  ],

  COBRADOR: [
    'dashboard.ver',
    'pagos.ver', 'pagos.registrar',
    'cobranza.ver',
  ],
};