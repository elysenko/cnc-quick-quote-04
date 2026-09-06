/** Domain types mirroring the Prisma models. Money is always integer cents; dimensions are millimetres. */

export type Role = 'USER' | 'MANAGER' | 'ADMIN';
export type BendDirection = 'UP' | 'DOWN';
export type OrderStatus = 'PAID' | 'FULFILLED' | 'CANCELLED';
export type ShippingRateType = 'FLAT' | 'PER_SHEET';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface Material {
  id: string;
  name: string;
  thicknessMm: number;
  sheetWMm: number;
  sheetHMm: number;
  costMultiplier: number;
  isActive: boolean;
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number; }

export interface Drawing {
  id: string;
  filename: string;
  sizeBytes: number;
  bbox: BBox;
  cutLengthMm: number;
  entityCount: number;
  createdAt: string;
  /** Parsed outline segments, in drawing units — canvas preview only. */
  paths: number[][];
}

export interface BendLine {
  id: string;
  drawingId: string;
  startX: number; startY: number; endX: number; endY: number;
  angleDeg: number;
  direction: BendDirection;
}

export interface Placement { x: number; y: number; sheet: number; }

export interface Nesting {
  cols: number; rows: number; perSheet: number; sheets: number;
  utilization: number;
  placements: Placement[];
}

export interface BreakdownLine { label: string; detail: string; amountCents: number; }

export interface Quote {
  id: string;
  drawingId: string;
  drawingName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  cutLengthMm: number;
  bendCount: number;
  breakdown: BreakdownLine[];
  nesting: Nesting;
  totalCents: number;
  createdAt: string;
  /** Delivery choice saved against the quote during checkout; null until the shipping step. */
  shippingMethodId: string | null;
  shippingCents: number | null;
  shippingAddress: Address | null;
}

export interface ShippingMethod {
  id: string;
  name: string;
  rateType: ShippingRateType;
  amountCents: number;
  /** Cost for the current quote: flat, or amountCents x sheets. */
  computedCents: number;
  estDeliveryDays: number;
  isActive: boolean;
}

export interface Address {
  line1: string; line2: string; city: string; region: string; postalCode: string; country: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  confirmationNumber: string;
  quoteId: string;
  email: string;
  itemSummary: string;
  shippingMethodName: string;
  shippingAddress: Address;
  estDeliveryDays: number;
  totalCents: number;
  status: OrderStatus;
  createdAt: string;
}

export interface PricingConfig {
  costPerLinearFtCents: number;
  setupFeeCents: number;
  handlingFeeCents: number;
  minOrderCents: number;
  costPerBendCents: number;
}

export interface MachineConfig {
  bedWMm: number; bedHMm: number;
  spacingMm: number; marginMm: number;
  animationSpeed: number;
  allowedExtensions: string[];
  maxUploadBytes: number;
  qtyMin: number; qtyMax: number;
}

export interface BusinessConfig {
  companyName: string; logoUrl: string;
  primaryColor: string; accentColor: string;
  contactEmail: string; contactPhone: string; supportHours: string;
  addressLine1: string; addressLine2: string;
  city: string; region: string; postalCode: string; country: string;
}

export interface PaymentConfig {
  stripePublishableKey: string;
  stripeSecretKeyMasked: string;
  stripeWebhookSecretMasked: string;
  sandboxMode: boolean;
}

export interface IntegrationSetting {
  key: string;
  label: string;
  kind: 'service' | 'integration';
  sdk: string;
  maskedValue: string;
  configured: boolean;
}
