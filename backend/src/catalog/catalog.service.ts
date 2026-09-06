import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Material, ShippingMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialDto, ShippingMethodDto } from '../settings/settings.dto';

export interface ShippingMethodView extends ShippingMethod {
  /** Flat methods bill once; per-sheet methods bill `amountCents × sheets`. */
  computedCents: number;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listMaterials(includeInactive = false): Promise<Material[]> {
    return this.prisma.material.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  /** 422 rather than 404: an inactive or unknown material is a bad quote input. */
  async requireActiveMaterial(id: string): Promise<Material> {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) {
      throw new UnprocessableEntityException('That material is no longer in the catalogue.');
    }
    if (!material.isActive) {
      throw new UnprocessableEntityException(
        `“${material.name}” is not currently available. Choose another material.`,
      );
    }
    return material;
  }

  createMaterial(dto: MaterialDto): Promise<Material> {
    return this.prisma.material.create({ data: { ...dto } });
  }

  async updateMaterial(id: string, dto: MaterialDto): Promise<Material> {
    await this.requireMaterial(id);
    return this.prisma.material.update({ where: { id }, data: { ...dto } });
  }

  async deleteMaterial(id: string): Promise<void> {
    await this.requireMaterial(id);
    await this.prisma.material.delete({ where: { id } });
  }

  private async requireMaterial(id: string): Promise<Material> {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('That material no longer exists.');
    return material;
  }

  async listShipping(includeInactive: boolean, sheets: number): Promise<ShippingMethodView[]> {
    const rows = await this.prisma.shippingMethod.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { amountCents: 'asc' }],
    });
    return rows.map((row) => ({ ...row, computedCents: CatalogService.rateFor(row, sheets) }));
  }

  static rateFor(method: ShippingMethod, sheets: number): number {
    return method.rateType === 'PER_SHEET'
      ? method.amountCents * Math.max(1, sheets)
      : method.amountCents;
  }

  async requireActiveShipping(id: string): Promise<ShippingMethod> {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!method || !method.isActive) {
      throw new UnprocessableEntityException(
        'That delivery method is no longer available. Choose another.',
      );
    }
    return method;
  }

  createShipping(dto: ShippingMethodDto): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.create({ data: { ...dto } });
  }

  async updateShipping(id: string, dto: ShippingMethodDto): Promise<ShippingMethod> {
    await this.requireShipping(id);
    return this.prisma.shippingMethod.update({ where: { id }, data: { ...dto } });
  }

  async deleteShipping(id: string): Promise<void> {
    await this.requireShipping(id);
    await this.prisma.shippingMethod.delete({ where: { id } });
  }

  private async requireShipping(id: string): Promise<ShippingMethod> {
    const method = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('That delivery method no longer exists.');
    return method;
  }
}
