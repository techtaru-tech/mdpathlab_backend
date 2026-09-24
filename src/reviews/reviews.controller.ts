import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ReviewsService } from './reviews.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  // Public — feeds the homepage reviews section.
  @Get()
  listApproved() {
    return this.reviews.listApproved();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  submit(@Req() req: any, @Body() dto: CreateReviewDto) {
    return this.reviews.submit(req.user.sub, dto);
  }
}
