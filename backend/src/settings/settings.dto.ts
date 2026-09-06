import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PricingConfigDto {
  @IsInt() @Min(0) costPerLinearFtCents!: number;
  @IsInt() @Min(0) setupFeeCents!: number;
  @IsInt() @Min(0) handlingFeeCents!: number;
  @IsInt() @Min(0) minOrderCents!: number;
  @IsInt() @Min(0) costPerBendCents!: number;
}

export class MachineConfigDto {
  @IsNumber() @Min(1) bedWMm!: number;
  @IsNumber() @Min(1) bedHMm!: number;
  @IsNumber() @Min(0) spacingMm!: number;
  @IsNumber() @Min(0) marginMm!: number;
  @IsNumber() @Min(0.1) animationSpeed!: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'List at least one file extension.' })
  @IsString({ each: true })
  allowedExtensions!: string[];

  @IsInt() @Min(1024) maxUploadBytes!: number;
  @IsInt() @Min(1) qtyMin!: number;
  @IsInt() @Min(1) qtyMax!: number;
}

export class BusinessConfigDto {
  @IsString() @MaxLength(160) companyName!: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsHexColor({ message: 'Use a hex colour such as #2563eb.' }) primaryColor!: string;
  @IsHexColor({ message: 'Use a hex colour such as #f97316.' }) accentColor!: string;
  @IsOptional() @IsString() @MaxLength(160) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(60) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(160) supportHours?: string;
  @IsOptional() @IsString() @MaxLength(160) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(160) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) region?: string;
  @IsOptional() @IsString() @MaxLength(40) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
}

/** Blank secret fields mean "keep what is stored" — a mask is never written back as plaintext. */
export class PaymentConfigDto {
  @IsOptional() @IsString() @MaxLength(255) stripePublishableKey?: string;
  @IsOptional() @IsString() @MaxLength(255) stripeSecretKey?: string;
  @IsOptional() @IsString() @MaxLength(255) stripeWebhookSecret?: string;
  @IsBoolean() sandboxMode!: boolean;
}

export class SystemSettingDto {
  @IsString() @MaxLength(200) key!: string;
  @IsString() @MaxLength(2000) value!: string;
}

export class MaterialDto {
  @IsString() @MaxLength(160) name!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) thicknessMm!: number;
  @Type(() => Number) @IsNumber() @Min(1) sheetWMm!: number;
  @Type(() => Number) @IsNumber() @Min(1) sheetHMm!: number;
  @Type(() => Number) @IsNumber() @Min(0.01) costMultiplier!: number;
  @IsBoolean() isActive!: boolean;
}

export class ShippingMethodDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() rateType!: 'FLAT' | 'PER_SHEET';
  @IsInt() @Min(0) amountCents!: number;
  @IsInt() @Min(0) estDeliveryDays!: number;
  @IsBoolean() isActive!: boolean;
}
