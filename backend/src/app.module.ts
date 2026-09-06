import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/auth.guard';
import { RateLimitGuard } from './common/rate-limit.guard';
import { RuntimeConfigService } from './common/runtime-config.service';
import { HealthController } from './health/health.controller';
import { SettingsService } from './settings/settings.service';
import { SettingsController } from './settings/settings.controller';
import { AdminController } from './settings/admin.controller';
import { CatalogService } from './catalog/catalog.service';
import { CatalogController } from './catalog/catalog.controller';
import { StorageService } from './drawings/storage.service';
import { DrawingsService } from './drawings/drawings.service';
import { DrawingsController } from './drawings/drawings.controller';
import { QuotesService } from './quotes/quotes.service';
import { QuotesController } from './quotes/quotes.controller';
import { StripeService } from './checkout/stripe.service';
import { CheckoutController } from './checkout/checkout.controller';
import { WebhooksController } from './checkout/webhooks.controller';
import { EmailService } from './orders/email.service';
import { OrdersService } from './orders/orders.service';
import { OrdersController } from './orders/orders.controller';

/**
 * Guard order is load-bearing: authenticate (401) → authorise (403) → rate limit (429),
 * so an anonymous caller can never learn anything from a limiter response.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [
    HealthController,
    SettingsController,
    AdminController,
    CatalogController,
    DrawingsController,
    QuotesController,
    CheckoutController,
    WebhooksController,
    OrdersController,
  ],
  providers: [
    RuntimeConfigService,
    SettingsService,
    CatalogService,
    StorageService,
    DrawingsService,
    QuotesService,
    StripeService,
    EmailService,
    OrdersService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
