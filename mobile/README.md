# Microcapital — App de Cobranza Móvil

App móvil de cobranza para Microcapital Ixtepec. Construida con **Ionic + Angular 17 + Capacitor**. Se conecta al backend de producción (`https://microcapital-ixtepec.com/api/v1`).

## Qué incluye esta primera entrega (núcleo)

- **Login** de cobrador/gestor (mismo endpoint que el sistema web)
- **Descarga de clientes asignados** con cache offline
- **Lista de clientes** con estado: al corriente / vencido
- **Registro de pagos**: monto, tipo (Día/Total/Mora), método (efectivo/transferencia/depósito)
- **Geolocalización** capturada al registrar el pago (para el monitor web)
- **Modo offline**: si no hay red, el pago se guarda localmente
- **Sincronización automática**: al recuperar conexión o volver a primer plano, los pagos pendientes se envían solos
- **Ticket** de pago para entregar/compartir con el cliente
- **Idempotencia**: cada pago lleva un `localId` único; si se reintenta, el backend no lo duplica

> Pendiente para la siguiente fase: registro de visitas (no localizado / promesa de pago), funciones de gestor (reestructuración y convenio desde la app), y el monitor de geolocalización en el sistema web (el backend ya expone `GET /payments/geo`).

## Requisitos previos

- Node.js 18+ y npm
- Android Studio (para compilar el APK)
- JDK 17

## Instalación

```bash
cd mobile
npm install
npm install -g @ionic/cli   # si no lo tienes
```

## Probar en el navegador (desarrollo)

```bash
ionic serve
```

Abre la app en el navegador. Útil para probar login, lista y flujo de pago (la geolocalización del navegador pedirá permiso; en escritorio puede no dar ubicación real).

## Compilar el APK de Android

```bash
# 1. Compilar el frontend y crear el proyecto Android
ionic build
npx cap add android      # solo la primera vez
npx cap sync android

# 2. Abrir en Android Studio
npx cap open android
```

En Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)**. El APK queda en `android/app/build/outputs/apk/debug/`.

Para un APK de release firmado, configura tu keystore en Android Studio (**Build > Generate Signed Bundle / APK**).

## Permisos

La geolocalización requiere permisos en `android/app/src/main/AndroidManifest.xml` (Capacitor los agrega con el plugin, pero verifica que estén):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

## Cambios necesarios en el BACKEND (antes de usar la app)

La app envía geolocalización en los pagos. El backend necesita:

1. **Ejecutar el SQL** `SQL-pagos-geolocalizacion.sql` (agrega columnas `lat`, `lng` a la tabla `pagos`).
2. **Actualizar la entidad `Payment`** (ver `NOTA-entidad-Payment.txt`): agregar campos `lat`, `lng`, y verificar `localId`.
3. **Reemplazar `payments.module.ts`** con la versión nueva (idempotencia + geolocalización + endpoint `GET /payments/geo` para el monitor web).

> Orden crítico: ejecuta el SQL **antes** de desplegar el código, o dará "Unknown column 'lat'".

## Configuración del backend que consume

Definido en `src/environments/environment.ts` y `environment.prod.ts`:

```
apiUrl: 'https://microcapital-ixtepec.com/api/v1'
```

Si corres el backend localmente, cambia `apiUrl` en `environment.ts` a `http://localhost:3000/api/v1` (o el puerto que uses) y, en Android, usa la IP de tu máquina en la red local (no `localhost`).

## Estructura

```
src/app/
  core/
    models.ts            Interfaces compartidas
    auth.service.ts      Login y sesión
    auth.interceptor.ts  Agrega el token Bearer
    storage.service.ts   Persistencia offline (Capacitor Preferences)
    network.service.ts   Estado online/offline
    collection.service.ts Clientes, info de pago, cola de sincronización
    geo.service.ts       Geolocalización
    ticket.service.ts    Genera el ticket de pago
  guards/
    auth.guard.ts        Protege rutas
  pages/
    login/               Inicio de sesión
    clients/             Lista de clientes asignados
    client-detail/       Detalle + saldo + mora
    payment/             Registro de pago + geo + ticket
```

## Cómo funciona el modo offline

1. Al abrir la lista, se muestran los clientes desde la cache local; si hay red, se actualizan en segundo plano.
2. Al registrar un pago, se guarda primero en el dispositivo (cola local) y se intenta enviar.
3. Si no hay red, el pago queda **pendiente** (badge en la pantalla de clientes).
4. Cuando vuelve la conexión (o la app pasa a primer plano), los pendientes se sincronizan solos.
5. El `localId` evita duplicados si un pago se reintenta.
