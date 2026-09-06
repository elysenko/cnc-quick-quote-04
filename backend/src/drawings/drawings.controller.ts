import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { BendLine } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { RateLimit } from '../common/rate-limit.guard';
import { BendDto, BendPatchDto } from './drawings.dto';
import { DrawingsService, DrawingView, toDrawingView } from './drawings.service';

/** Multer keeps the upload in memory; the size gate runs before anything is written. */
const MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;

@ApiTags('drawings')
@Controller('drawings')
export class DrawingsController {
  constructor(private readonly drawings: DrawingsService) {}

  @Post()
  @RateLimit({ bucket: 'drawing-upload', limit: 30, windowSeconds: 300 })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEMORY_LIMIT_BYTES } }))
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DrawingView> {
    if (!file) throw new BadRequestException('Attach a drawing file to upload.');
    return this.drawings.upload(user.sub, file);
  }

  @Get()
  listMine(@CurrentUser() user: JwtPayload): Promise<DrawingView[]> {
    return this.drawings.listMine(user.sub);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<DrawingView> {
    return toDrawingView(await this.drawings.requireOwned(id, user.sub, user.role));
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ url: string }> {
    return this.drawings.downloadUrl(id, user.sub, user.role);
  }

  @Get(':id/bends')
  async listBends(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<BendLine[]> {
    await this.drawings.requireOwned(id, user.sub, user.role);
    return this.drawings.listBends(id);
  }

  @Post(':id/bends')
  async createBend(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: BendDto,
  ): Promise<BendLine> {
    await this.drawings.requireOwned(id, user.sub, user.role);
    return this.drawings.createBend(id, dto);
  }

  @Patch(':id/bends/:bendId')
  async updateBend(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('bendId') bendId: string,
    @Body() dto: BendPatchDto,
  ): Promise<BendLine> {
    await this.drawings.requireOwned(id, user.sub, user.role);
    return this.drawings.updateBend(id, bendId, dto);
  }

  @Delete(':id/bends/:bendId')
  @HttpCode(204)
  async deleteBend(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('bendId') bendId: string,
  ): Promise<void> {
    await this.drawings.requireOwned(id, user.sub, user.role);
    await this.drawings.deleteBend(id, bendId);
  }
}
