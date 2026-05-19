# Sistema de Gestión Microfinanciera

Sistema completo para gestión de microcréditos: préstamos, cobranza, reestructuración y reportes.

## Estructura del proyecto

```
microfinanciera/
├── backend/          # API REST con NestJS + TypeScript
├── frontend/         # SPA Angular 17 (sistema administrativo)
├── mobile/           # App Ionic/Angular (cobranza en campo)
└── infra/            # Docker, Nginx, scripts de deploy
```

## Inicio rápido

### Prerrequisitos
- Node.js 18+
- Docker & Docker Compose
- MySQL 8.0 (o usar Docker)

### Desarrollo con Docker
```bash
# Clonar y levantar todo el stack
docker-compose up -d

# Backend disponible en: http://localhost:3000
# Frontend disponible en: http://localhost:4200
# API Docs (Swagger): http://localhost:3000/api/docs
```

### Desarrollo local

#### Backend
```bash
cd backend
npm install
cp .env.example .env   # Configurar variables
npm run migration:run  # Ejecutar migraciones
npm run seed           # Datos iniciales
npm run start:dev      # Puerto 3000
```

#### Frontend
```bash
cd frontend
npm install
npm start              # Puerto 4200
```

#### App Móvil
```bash
cd mobile
npm install
npx ionic serve        # Puerto 8100 (browser)
npx ionic cap run android  # Android
npx ionic cap run ios      # iOS
```

## Usuarios por defecto (seed)

| Email | Contraseña | Rol |
|-------|-----------|-----|
| admin@microfin.com | Admin123! | Administrador |
| cajero@microfin.com | Cajero123! | Cajero |
| autorizador@microfin.com | Auth123! | Autorizador |
| cobrador@microfin.com | Cobrador123! | Cobrador |

## Variables de entorno (Backend)

Ver `backend/.env.example` para la lista completa.

## Documentación

- API REST: `http://localhost:3000/api/docs` (Swagger UI)
- Arquitectura: ver `/docs/arquitectura.md`

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS + TypeORM + MySQL 8.0  |
| Frontend | Angular 17 + Angular Material |
| Mobile | Ionic 7 + Angular + Capacitor |
| Auth | JWT (access 15min + refresh 7d) |
| PDF | PDFKit |
| Excel | ExcelJS |
| Contenedores | Docker + Nginx |
