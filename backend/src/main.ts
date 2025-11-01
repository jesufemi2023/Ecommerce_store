import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import helmet from 'helmet';
import compression from 'compression';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { dump } from 'js-yaml';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const PORT = process.env.PORT ?? 3000;
  const logger = new Logger('Bootstrap');

  // Security middleware
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Global serializer
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('E-Commerce Fashion API')
    .setDescription('API documentation for the Fashion E-commerce backend')
    .setVersion('1.0')
    .addBearerAuth() // ✅ adds JWT auth header globally
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Optional: serve it via Swagger UI at /docs
  SwaggerModule.setup('docs', app, document);

  // ✅ Export OpenAPI document to YAML file
  const yamlData = dump(document);
  writeFileSync('./openapi.yaml', yamlData);

  await app.listen(PORT);
  logger.log(`🚀 Server running at: http://localhost:${PORT}`);
}
bootstrap();
