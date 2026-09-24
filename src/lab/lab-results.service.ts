import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveOrderParameterIds } from '../common/resolve-order-parameters.js';
import { UpsertResultValueDto } from './dto/upsert-result-value.dto.js';

@Injectable()
export class LabResultsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwnedOrder(labId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.labId !== labId) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Every Parameter this order's items actually require a value for — resolved the same way
   * CatalogueService normalizes a Test/Package (PARAMETER items ARE a parameter directly;
   * PROFILE items expand via ProfileParameter; PACKAGE items expand via PackageItem, which is
   * itself either a PARAMETER or a PROFILE). Existing LabResultValue rows for the order are
   * merged in so the lab dashboard can show what's already been entered.
   */
  async getRequiredParameters(labId: string, orderId: string) {
    await this.assertOwnedOrder(labId, orderId);

    const [parameterIds, existing] = await Promise.all([
      resolveOrderParameterIds(this.prisma, orderId),
      this.prisma.labResultValue.findMany({ where: { orderId } }),
    ]);

    const parameters = await this.prisma.parameter.findMany({ where: { id: { in: Array.from(parameterIds) } } });
    const existingByParameter = new Map(existing.map((v) => [v.parameterId, v]));

    return parameters.map((p) => ({
      parameterId: p.id,
      name: p.name,
      value: existingByParameter.get(p.id)?.value ?? null,
      unit: existingByParameter.get(p.id)?.unit ?? null,
      enteredAt: existingByParameter.get(p.id)?.enteredAt ?? null,
    }));
  }

  async upsertValue(labId: string, orderId: string, dto: UpsertResultValueDto) {
    const order = await this.assertOwnedOrder(labId, orderId);
    if (order.status !== 'SAMPLE_COLLECTED' && order.status !== 'IN_LAB') {
      throw new BadRequestException('Result values can only be entered once the sample has been collected');
    }

    const parameter = await this.prisma.parameter.findUnique({ where: { id: dto.parameterId } });
    if (!parameter) throw new NotFoundException('Parameter not found');

    return this.prisma.labResultValue.upsert({
      where: { orderId_parameterId: { orderId, parameterId: dto.parameterId } },
      update: { value: dto.value, unit: dto.unit },
      create: { orderId, parameterId: dto.parameterId, value: dto.value, unit: dto.unit },
    });
  }
}
