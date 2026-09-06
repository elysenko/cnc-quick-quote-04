import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateQuoteDto {
  @IsString() drawingId!: string;
  @IsString() materialId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number.' })
  quantity!: number;
}

export class NestPreviewDto {
  @IsString() drawingId!: string;
  @IsString() materialId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number.' })
  quantity!: number;
}

export class QuoteShippingDto {
  @IsString() shippingMethodId!: string;
  @IsString() @MaxLength(160) line1!: string;
  @IsOptional() @IsString() @MaxLength(160) line2?: string;
  @IsString() @MaxLength(120) city!: string;
  @IsString() @MaxLength(120) region!: string;
  @IsString() @MaxLength(40) postalCode!: string;
  @IsString() @MaxLength(120) country!: string;
}

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @IsString() sort?: string;
}
