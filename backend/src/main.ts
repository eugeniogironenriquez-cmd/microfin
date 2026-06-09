import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
  origin: [
    'https://microcapital-ixtepec.com',
    'https://sitio.microcapital-ixtepec.com',   // ← el nuevo subdominio del frontend
    'http://localhost:4200',                      // desarrollo local (opcional)
    'capacitor://localhost',                      // app móvil Capacitor (Android)
    'http://localhost',                           // app móvil (WebView),
    'http://localhost:8100',                           // app móvil (WebView)
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MicroFin API')
    .setDescription('Sistema de Gestión Microfinanciera')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 MicroFin API corriendo en http://localhost:${port}/api/v1`);
  console.log(`📖 Swagger en http://localhost:${port}/api/v1/docs`);
}
bootstrap();
