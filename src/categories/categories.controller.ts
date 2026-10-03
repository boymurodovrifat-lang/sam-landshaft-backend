import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { presetToScheme } from './presets';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('tree')
  findTree() {
    return this.service.findTree();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  // Returns default palette/unit/min/max for a subcategory based on slug,
  // without saving. Frontend can preview before applying.
  @Get(':id/default-preset')
  async getDefaultPreset(@Param('id', ParseIntPipe) id: number) {
    const category = await this.service.findOne(id);
    if (category.parentId == null) {
      throw new BadRequestException(
        'Preset faqat subkategoriya uchun mavjud',
      );
    }
    const preset = presetToScheme(category.slug);
    if (!preset) {
      throw new NotFoundException(
        `"${category.slug}" slug uchun standart palitra topilmadi`,
      );
    }
    return preset;
  }

  // Applies the default preset (palette + unit + min/max) for the
  // subcategory's slug, persisting to DB.
  @UseGuards(JwtAuthGuard)
  @Post(':id/apply-preset')
  async applyPreset(@Param('id', ParseIntPipe) id: number) {
    const category = await this.service.findOne(id);
    if (category.parentId == null) {
      throw new BadRequestException(
        'Preset faqat subkategoriya uchun mavjud',
      );
    }
    const preset = presetToScheme(category.slug);
    if (!preset) {
      throw new NotFoundException(
        `"${category.slug}" slug uchun standart palitra topilmadi`,
      );
    }
    return this.service.update(id, {
      unit: preset.unit,
      minValue: preset.minValue,
      maxValue: preset.maxValue,
      colorScheme: preset.colorScheme,
    });
  }
}
