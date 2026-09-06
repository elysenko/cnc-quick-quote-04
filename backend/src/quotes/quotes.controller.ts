import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../common/rate-limit.guard';
import { NestResult } from './nesting';
import { CreateQuoteDto, QuoteShippingDto } from './quotes.dto';
import { QuotesService, QuoteView } from './quotes.service';

@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @RateLimit({ bucket: 'quote-create', limit: 60, windowSeconds: 300 })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateQuoteDto): Promise<QuoteView> {
    return this.quotes.create(user.sub, user.role, dto);
  }

  /** Sheet counts are shown before the quote is generated, so multi-sheet jobs are no surprise. */
  @Post('preview-nesting')
  @HttpCode(200)
  @RateLimit({ bucket: 'nesting-preview', limit: 120, windowSeconds: 300 })
  previewNesting(@CurrentUser() user: JwtPayload, @Body() dto: CreateQuoteDto): Promise<NestResult> {
    return this.quotes.previewNesting(user.sub, user.role, dto);
  }

  /** Prices a draft without persisting it — the wizard's live total. */
  @Post('preview')
  @HttpCode(200)
  @RateLimit({ bucket: 'quote-preview', limit: 120, windowSeconds: 300 })
  preview(@CurrentUser() user: JwtPayload, @Body() dto: CreateQuoteDto) {
    return this.quotes.previewQuote(user.sub, user.role, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload): Promise<QuoteView[]> {
    return this.quotes.list(user.sub, user.role);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<QuoteView> {
    return this.quotes.getById(id, user.sub, user.role);
  }

  @Put(':id/shipping')
  setShipping(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: QuoteShippingDto,
  ): Promise<QuoteView> {
    return this.quotes.setShipping(id, user.sub, user.role, dto);
  }
}
