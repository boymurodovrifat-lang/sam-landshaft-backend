import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { GdalService } from './services/gdal.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, GdalService],
  exports: [FilesService],
})
export class FilesModule {}
