import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { BigIntSerializationInterceptor } from './common/bigint-serialization.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  // CORS — bir nechta origin'ni qo'llab-quvvatlash (vergul bilan ajratilgan)
  const corsEnv = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  const origins = corsEnv.split(',').map((s) => s.trim()).filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true); // curl, mobile apps
      if (origins.includes(origin) || origins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  });

  app.useGlobalInterceptors(new BigIntSerializationInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.get<number>('PORT', 3000);
  const server = await app.listen(port);
  // Katta GeoTIFF (2 GB gacha) yuklashda sekin ulanishlarda so'rov 5 daqiqadan
  // oshib ketishi mumkin. Node'ning default requestTimeout (300s) ni oshiramiz —
  // aks holda upload 408 / "Network Error" bilan uziladi.
  server.requestTimeout = 30 * 60 * 1000; // 30 daqiqa
  server.headersTimeout = 31 * 60 * 1000;
  server.keepAliveTimeout = 65 * 1000;
  logger.log(`Sam-Landshaft API running on http://localhost:${port}/api`);
  logger.log(`Allowed origins: ${origins.join(', ')}`);
}
bootstrap();
