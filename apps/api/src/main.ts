import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.enableCors({ origin: false });
app.set('trust proxy', 1);

const doc = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle('DigiSchools API').setVersion('0.1').addBearerAuth().build(),
);
SwaggerModule.setup('docs', app, doc);

await app.listen(Number(process.env.PORT ?? 3001));
