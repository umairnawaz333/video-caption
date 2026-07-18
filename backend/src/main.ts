import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // comma-separated list of allowed frontend origins, e.g. "https://myapp.vercel.app"
  const origins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim());
  app.enableCors({ origin: origins ?? 'http://localhost:3000' });
  await app.listen(Number(process.env.PORT ?? 4000));
}
bootstrap();
