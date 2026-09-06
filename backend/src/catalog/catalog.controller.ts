import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Material } from '@prisma/client';
import { CatalogService, ShippingMethodView } from './catalog.service';

/** Customer-facing catalogue reads. Inactive rows are never exposed here. */
@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('materials')
  materials(): Promise<Material[]> {
    return this.catalog.listMaterials(false);
  }

  @Get('shipping-methods')
  shipping(@Query('sheets') sheets?: string): Promise<ShippingMethodView[]> {
    const parsed = Number.parseInt(sheets ?? '1', 10);
    return this.catalog.listShipping(false, Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }
}
