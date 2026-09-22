import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
config();

const dataSource = new DataSource({
  type: 'mysql',
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '12345678',
  database: process.env.DB_NAME     || 'microfin',
  charset: 'utf8mb4',
});

async function seed() {
  console.log('📦 Iniciando seed...');
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();

  try {
    // ── USUARIOS ───────────────────────────────────────────
    const usuarios = [
      { nombre: 'Administrador',  correo: 'admin@microfin.com',         clave: 'Admin123!',     rol: 'ADMIN' },
      { nombre: 'Cajero',         correo: 'cajero@microfin.com',         clave: 'Cajero123!',    rol: 'CAJERO' },
      { nombre: 'Autorizador',    correo: 'autorizador@microfin.com',    clave: 'Auth123!',      rol: 'AUTORIZADOR' },
      { nombre: 'Cobrador',       correo: 'cobrador@microfin.com',       clave: 'Cobrador123!',  rol: 'COBRADOR' },
    ];

    for (const u of usuarios) {
      const [existing] = await qr.query(
        `SELECT id FROM usuarios WHERE correo = ?`, [u.correo]
      );
      if (!existing) {
        const hash = await bcrypt.hash(u.clave, 12);
        await qr.query(
          `INSERT INTO usuarios (nombre, correo, contrasena_hash, rol, activo) VALUES (?, ?, ?, ?, 1)`,
          [u.nombre, u.correo, hash, u.rol]
        );
        console.log(`  ✓ Usuario creado: ${u.correo}`);
      } else {
        console.log(`  · Usuario ya existe: ${u.correo}`);
      }
    }

    // ── TIPOS DE PRÉSTAMO ──────────────────────────────────
    const tipos = [
      {
        nombre: 'Crédito Personal Semanal',
        tasa_default: 0.05, tasa_minima: 0.03, tasa_maxima: 0.10,
        monto_minimo: 1000, monto_maximo: 20000,
        plazo_minimo_semanas: 4, plazo_maximo_semanas: 52,
        frecuencia: 'SEMANAL', dias_periodo: 7, unidad_periodo: 'SEMANAS',
        dias_gracia: 1,
      },
      {
        nombre: 'Crédito Diario',
        tasa_default: 0.03, tasa_minima: 0.02, tasa_maxima: 0.05,
        monto_minimo: 500, monto_maximo: 10000,
        plazo_minimo_semanas: 1, plazo_maximo_semanas: 12,
        frecuencia: 'DIARIO', dias_periodo: 1, unidad_periodo: 'DIAS',
        dias_gracia: 0,
      },
      {
        nombre: 'Crédito Quincenal',
        tasa_default: 0.08, tasa_minima: 0.05, tasa_maxima: 0.15,
        monto_minimo: 2000, monto_maximo: 50000,
        plazo_minimo_semanas: 4, plazo_maximo_semanas: 104,
        frecuencia: 'QUINCENAL', dias_periodo: 15, unidad_periodo: 'DIAS',
        dias_gracia: 2,
      },
      {
        nombre: 'Crédito Mensual',
        tasa_default: 0.10, tasa_minima: 0.07, tasa_maxima: 0.18,
        monto_minimo: 5000, monto_maximo: 100000,
        plazo_minimo_semanas: 4, plazo_maximo_semanas: 156,
        frecuencia: 'MENSUAL', dias_periodo: 30, unidad_periodo: 'MESES',
        dias_gracia: 3,
      },
    ];

    for (const t of tipos) {
      const [existing] = await qr.query(
        `SELECT id FROM tipos_prestamo WHERE nombre = ?`, [t.nombre]
      );
      if (!existing) {
        await qr.query(
          `INSERT INTO tipos_prestamo
           (nombre, tasa_default, tasa_minima, tasa_maxima,
            monto_minimo, monto_maximo,
            plazo_minimo_semanas, plazo_maximo_semanas,
            frecuencia, dias_periodo, unidad_periodo, dias_gracia, activo)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
          [
            t.nombre, t.tasa_default, t.tasa_minima, t.tasa_maxima,
            t.monto_minimo, t.monto_maximo,
            t.plazo_minimo_semanas, t.plazo_maximo_semanas,
            t.frecuencia, t.dias_periodo, t.unidad_periodo, t.dias_gracia,
          ]
        );
        console.log(`  ✓ Tipo de préstamo creado: ${t.nombre}`);
      } else {
        console.log(`  · Tipo ya existe: ${t.nombre}`);
      }
    }

    console.log('\n✅ Seed completado exitosamente');
    console.log('\nUsuarios disponibles:');
    console.log('  admin@microfin.com       / Admin123!');
    console.log('  cajero@microfin.com      / Cajero123!');
    console.log('  autorizador@microfin.com / Auth123!');
    console.log('  cobrador@microfin.com    / Cobrador123!');

  } catch (err) {
    console.error('Error en seed:', err);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

seed();
