import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email },
    });
    if (!admin) {
      throw new UnauthorizedException('Email yoki parol noto\'g\'ri');
    }
    const valid = await bcrypt.compare(dto.password, admin.password);
    if (!valid) {
      throw new UnauthorizedException('Email yoki parol noto\'g\'ri');
    }

    const accessToken = await this.jwt.signAsync({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });

    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        createdAt: admin.createdAt,
      },
    };
  }

  async me(id: number) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new UnauthorizedException();
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      createdAt: admin.createdAt,
    };
  }
}
