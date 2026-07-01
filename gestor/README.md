# Portal de Gestión de Cobranza — Microcapital Ixtepec

Sitio web independiente para el **gestor de cobranza**, pensado para su propio
subdominio (ej. `gestor.microcapital-ixtepec.com`). Consume el **mismo backend**
que el sistema principal y la app móvil.

Stack: **Angular 17 + Angular Material**, responsive (PC y móvil).

## Funciones

- **Login propio** (usa `POST /auth/login` del backend existente).
- **Monitor de cartera** — semáforo de tres colores:
  - 🟢 Verde: al corriente (0 cuotas vencidas)
  - 🟡 Amarillo: en riesgo (1–5 cuotas vencidas)
  - 🔴 Rojo: crítico (más de 5 cuotas vencidas)
  - Tarjetas-resumen que filtran la tabla al hacer clic.
- **Gestión de cobranza** — vista enfocada en los créditos rojos (los que
  requieren acción), con botón para llamar al cliente.
- **Acciones sobre un crédito** (en pestañas):
  - **Promesa de pago** (`POST /visitas` tipo `PROMESA_PAGO`)
  - **Convenio** (`POST /loans/:id/convenio`)
  - **Reestructura** con simulación previa (`POST /loans/simulate` + `POST /loans/:id/restructure`)
  - Muestra el **historial de comportamiento** del cliente si tiene antecedentes.
- **Umbrales del semáforo** — configurar los límites verde/amarillo/rojo.

## Instalación

```bash
cd gestor-app
npm install
npm start          # desarrollo en http://localhost:4200
```

## Compilar para producción

```bash
npm run build:prod
```
Genera `dist/microcapital-gestor/`. Sube esa carpeta a tu servidor/hosting del
subdominio.

## Configuración de la API

La URL del backend está en `src/environments/environment.ts` y
`environment.prod.ts`:

```typescript
apiUrl: 'https://microcapital-ixtepec.com/api/v1'
```

## Despliegue en subdominio (Nginx, ejemplo)

Al ser una SPA de Angular, todas las rutas deben redirigir a `index.html`:

```nginx
server {
    server_name gestor.microcapital-ixtepec.com;
    root /var/www/gestor/dist/microcapital-gestor;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Permisos usados (deben existir en la tabla `permisos`)

- `cartera.semaforo` — ver el monitor completo (los 3 colores)
- `cobranza.gestor` — ver la vista de gestión (rojos) y aplicar acciones
- `config.editar` — editar los umbrales del semáforo

El menú lateral muestra u oculta cada sección según los permisos del usuario
logueado (se leen de `user.permissions` tras el login).

## Pendiente de confirmar con el backend

Los formularios de **Convenio** y **Reestructura** usan campos tentativos
(marcados con un aviso azul en la UI). Cuando tengas los campos exactos que
esperan `POST /loans/:id/convenio` y `POST /loans/:id/restructure`, se ajustan
en `src/app/features/acciones/acciones.component.ts` y en los métodos
`convenio()` / `reestructurar()` de `src/app/core/gestor.service.ts`.

## Estructura

```
src/app/
  core/            servicios base (auth, api, gestor), modelos, guard, interceptor
  layout/          shell responsive con sidebar
  features/
    auth/          login
    semaforo/      monitor de cartera + config de umbrales
    gestor/        vista de gestión (rojos)
    acciones/      promesa / convenio / reestructura
```
