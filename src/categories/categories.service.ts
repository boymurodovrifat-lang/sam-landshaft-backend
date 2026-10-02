import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  findTree() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true },
    });
    if (!category) throw new NotFoundException('Kategoriya topilmadi');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId != null) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('Parent kategoriya topilmadi');
      if (parent.parentId != null) {
        throw new BadRequestException('Subkategoriyaga subkategoriya qo\'shib bo\'lmaydi');
      }
    }
    return this.prisma.category.create({ data: dto });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);
    if (dto.parentId != null) {
      if (dto.parentId === id) {
        throw new BadRequestException('Kategoriya o\'ziga parent bo\'lolmaydi');
      }
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('Parent kategoriya topilmadi');
      if (parent.parentId != null) {
        throw new BadRequestException('Subkategoriyaga subkategoriya qo\'shib bo\'lmaydi');
      }
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }
}
