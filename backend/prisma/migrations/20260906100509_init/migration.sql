-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BendDirection" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PAID', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShippingRateType" AS ENUM ('FLAT', 'PER_SHEET');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colossus_accounts" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "login_path" TEXT NOT NULL,
    "created_by" TEXT NOT NULL DEFAULT 'colossus',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colossus_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thicknessMm" DOUBLE PRECISION NOT NULL,
    "sheetWMm" DOUBLE PRECISION NOT NULL,
    "sheetHMm" DOUBLE PRECISION NOT NULL,
    "costMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "minX" DOUBLE PRECISION NOT NULL,
    "minY" DOUBLE PRECISION NOT NULL,
    "maxX" DOUBLE PRECISION NOT NULL,
    "maxY" DOUBLE PRECISION NOT NULL,
    "cutLengthMm" DOUBLE PRECISION NOT NULL,
    "entityCount" INTEGER NOT NULL,
    "paths" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bend_lines" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "startX" DOUBLE PRECISION NOT NULL,
    "startY" DOUBLE PRECISION NOT NULL,
    "endX" DOUBLE PRECISION NOT NULL,
    "endY" DOUBLE PRECISION NOT NULL,
    "angleDeg" DOUBLE PRECISION NOT NULL,
    "direction" "BendDirection" NOT NULL DEFAULT 'UP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bend_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "drawingName" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cutLengthMm" DOUBLE PRECISION NOT NULL,
    "bendCount" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "nesting" JSONB NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippingMethodId" TEXT,
    "shippingCents" INTEGER,
    "shipLine1" TEXT,
    "shipLine2" TEXT,
    "shipCity" TEXT,
    "shipRegion" TEXT,
    "shipPostalCode" TEXT,
    "shipCountry" TEXT,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateType" "ShippingRateType" NOT NULL DEFAULT 'FLAT',
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "estDeliveryDays" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "confirmationNumber" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "itemSummary" TEXT NOT NULL,
    "shippingMethodName" TEXT NOT NULL,
    "shipLine1" TEXT NOT NULL DEFAULT '',
    "shipLine2" TEXT NOT NULL DEFAULT '',
    "shipCity" TEXT NOT NULL DEFAULT '',
    "shipRegion" TEXT NOT NULL DEFAULT '',
    "shipPostalCode" TEXT NOT NULL DEFAULT '',
    "shipCountry" TEXT NOT NULL DEFAULT '',
    "estDeliveryDays" INTEGER NOT NULL DEFAULT 5,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PAID',
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "pricing_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "costPerLinearFtCents" INTEGER NOT NULL DEFAULT 285,
    "setupFeeCents" INTEGER NOT NULL DEFAULT 3500,
    "handlingFeeCents" INTEGER NOT NULL DEFAULT 1200,
    "minOrderCents" INTEGER NOT NULL DEFAULT 7500,
    "costPerBendCents" INTEGER NOT NULL DEFAULT 140,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "bedWMm" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "bedHMm" DOUBLE PRECISION NOT NULL DEFAULT 3000,
    "spacingMm" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "marginMm" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "animationSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1.4,
    "allowedExtensions" TEXT[] DEFAULT ARRAY['.dxf']::TEXT[],
    "maxUploadBytes" INTEGER NOT NULL DEFAULT 10485760,
    "qtyMin" INTEGER NOT NULL DEFAULT 1,
    "qtyMax" INTEGER NOT NULL DEFAULT 500,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT 'CNC Quick Quote',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "accentColor" TEXT NOT NULL DEFAULT '#f97316',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "supportHours" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "stripePublishableKey" TEXT NOT NULL DEFAULT '',
    "stripeSecretKey" TEXT NOT NULL DEFAULT '',
    "stripeWebhookSecret" TEXT NOT NULL DEFAULT '',
    "sandboxMode" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "colossus_accounts_email_key" ON "colossus_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "drawings_userId_idx" ON "drawings"("userId");

-- CreateIndex
CREATE INDEX "bend_lines_drawingId_idx" ON "bend_lines"("drawingId");

-- CreateIndex
CREATE INDEX "quotes_userId_idx" ON "quotes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_confirmationNumber_key" ON "orders"("confirmationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_stripeSessionId_key" ON "orders"("stripeSessionId");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_stripeEventId_key" ON "webhook_events"("stripeEventId");

-- AddForeignKey
ALTER TABLE "bend_lines" ADD CONSTRAINT "bend_lines_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "drawings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
