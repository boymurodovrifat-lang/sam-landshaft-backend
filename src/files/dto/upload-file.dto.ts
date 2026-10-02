import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

export class UploadFileDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  categoryId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;
}
