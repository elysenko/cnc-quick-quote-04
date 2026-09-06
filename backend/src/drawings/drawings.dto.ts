import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class BendDto {
  @Type(() => Number) @IsNumber() startX!: number;
  @Type(() => Number) @IsNumber() startY!: number;
  @Type(() => Number) @IsNumber() endX!: number;
  @Type(() => Number) @IsNumber() endY!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Bend angle must be between 0 and 180 degrees.' })
  @Max(180, { message: 'Bend angle must be between 0 and 180 degrees.' })
  angleDeg!: number;

  @IsIn(['UP', 'DOWN'], { message: 'Bend direction must be UP or DOWN.' })
  direction!: 'UP' | 'DOWN';
}

export class BendPatchDto {
  @IsOptional() @Type(() => Number) @IsNumber() startX?: number;
  @IsOptional() @Type(() => Number) @IsNumber() startY?: number;
  @IsOptional() @Type(() => Number) @IsNumber() endX?: number;
  @IsOptional() @Type(() => Number) @IsNumber() endY?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Bend angle must be between 0 and 180 degrees.' })
  @Max(180, { message: 'Bend angle must be between 0 and 180 degrees.' })
  angleDeg?: number;

  @IsOptional()
  @IsIn(['UP', 'DOWN'], { message: 'Bend direction must be UP or DOWN.' })
  direction?: 'UP' | 'DOWN';
}
