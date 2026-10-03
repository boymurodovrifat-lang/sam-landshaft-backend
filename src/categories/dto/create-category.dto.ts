import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsInt()
  @IsOptional()
  parentId?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  unit?: string;

  @IsString()
  @IsOptional()
  colorScheme?: string;

  @IsNumber()
  @IsOptional()
  minValue?: number;

  @IsNumber()
  @IsOptional()
  maxValue?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
