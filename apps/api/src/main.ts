import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3025',
    credentials: true,
  });

  const port = process.env.PORT || 4025;
  await app.listen(port);
  console.log(`[Gepetto Shield API] Running on port ${port}`);
}

bootstrap();
