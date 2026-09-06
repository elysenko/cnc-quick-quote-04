import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrdersService, OrderView } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload): Promise<OrderView[]> {
    return this.orders.list(user.sub, user.role);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<OrderView> {
    return this.orders.getById(id, user.sub, user.role);
  }

  /** Printable receipt for the confirmation screen's download link. */
  @Get(':id/receipt')
  @Header('Content-Type', 'text/html; charset=utf-8')
  receipt(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<string> {
    return this.orders.receiptHtml(id, user.sub, user.role);
  }
}
