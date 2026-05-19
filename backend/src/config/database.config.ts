import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.get('DB_HOST', 'localhost'),
  port: config.get<number>('DB_PORT', 3306),
  username: config.get('DB_USER', 'microfin'),
  password: config.get('DB_PASSWORD', 'microfin2024'),
  database: config.get('DB_NAME', 'microfin'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: config.get('NODE_ENV') === 'development',
  charset: 'utf8mb4',
  timezone: '+00:00',
  extra: {
    connectionLimit: 10,
    connectTimeout: 10000,
  },
});
