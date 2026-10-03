import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './auth/auth.service';
import { FilesService } from './files/files.service';
import { BigIntSerializationInterceptor } from './common/bigint-serialization.interceptor';

describe('HTTP security boundaries (mock database)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const remove = jest.fn().mockResolvedValue({ success: true });
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = '0123456789abcdef'.repeat(4);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        admin: {
          findUnique: jest.fn(({ where }) => ({
            id: where.id,
            role: where.id === 2 ? 'SUPER_ADMIN' : 'ADMIN',
          })),
        },
      })
      .overrideProvider(AuthService)
      .useValue({
        login: () => {
          throw new UnauthorizedException();
        },
      })
      .overrideProvider(FilesService)
      .useValue({
        remove,
        findAll: () => [
          {
            id: 1,
            cogPath: '/private/cog',
            originalPath: '/private/upload',
            fileSize: BigInt(12),
          },
        ],
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new BigIntSerializationInterceptor());
    await app.init();
    jwt = app.get(JwtService);
  });
  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  it('rejects anonymous and ordinary admin deletion; allows super admin', async () => {
    await request(app.getHttpServer()).delete('/api/files/1').expect(401);
    await request(app.getHttpServer())
      .delete('/api/files/1')
      .auth(jwt.sign({ sub: 1 }), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/files/1')
      .auth(jwt.sign({ sub: 2 }), { type: 'bearer' })
      .expect(200);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('throttles failed login attempts', async () => {
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@example.org', password: 'wrong-password' })
        .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@example.org', password: 'wrong-password' })
      .expect(429);
  });
  it('omits internal filesystem paths from public JSON', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/files')
      .expect(200);
    expect(result.body).toEqual([{ id: 1, fileSize: 12 }]);
  });
  it('rejects category path traversal before database access', async () => {
    await request(app.getHttpServer())
      .post('/api/categories')
      .auth(jwt.sign({ sub: 1 }), { type: 'bearer' })
      .send({ name: 'Test', slug: '../../private' })
      .expect(400);
  });
});
