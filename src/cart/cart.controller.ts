import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  list(@Req() req: any) {
    return this.cart.list(req.user.sub);
  }

  @Post()
  add(@Req() req: any, @Body() dto: AddCartItemDto) {
    return this.cart.add(req.user.sub, dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCartItemDto) {
    return this.cart.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.cart.remove(req.user.sub, id);
  }

  @Delete()
  clear(@Req() req: any) {
    return this.cart.clear(req.user.sub);
  }
}
