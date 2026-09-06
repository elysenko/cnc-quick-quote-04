import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';

/**
 * Every navigable state is URL-addressable and carries `data.flow`. Modals are
 * addressed as `?modal=<name>` and detail panes as `?panel=<name>` by the pages
 * themselves, so a reviewer can deep-link straight into any of them.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'quote/new/upload' },

  {
    path: 'login',
    data: { flow: 'auth' },
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    data: { flow: 'auth' },
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },

  {
    path: 'quote/new',
    canActivate: [authGuard],
    data: { flow: 'quote-wizard' },
    loadComponent: () =>
      import('./features/quote/quote-wizard.component').then((m) => m.QuoteWizardComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'upload' },
      {
        path: 'upload',
        data: { flow: 'quote-upload' },
        loadComponent: () =>
          import('./features/quote/upload-step.component').then((m) => m.UploadStepComponent),
      },
      {
        path: 'material',
        data: { flow: 'quote-material' },
        loadComponent: () =>
          import('./features/quote/material-step.component').then((m) => m.MaterialStepComponent),
      },
      {
        path: 'bends',
        data: { flow: 'quote-bends' },
        loadComponent: () =>
          import('./features/quote/bend-step.component').then((m) => m.BendStepComponent),
      },
      {
        path: 'result',
        data: { flow: 'quote-result' },
        loadComponent: () =>
          import('./features/quote/result-step.component').then((m) => m.ResultStepComponent),
      },
    ],
  },

  {
    path: 'quotes',
    canActivate: [authGuard],
    data: { flow: 'quotes-list' },
    loadComponent: () =>
      import('./features/quotes/quote-list.component').then((m) => m.QuoteListComponent),
  },
  {
    path: 'quotes/:id',
    canActivate: [authGuard],
    data: { flow: 'quote-detail' },
    loadComponent: () =>
      import('./features/quotes/quote-detail.component').then((m) => m.QuoteDetailComponent),
  },

  { path: 'checkout/:quoteId', pathMatch: 'full', redirectTo: 'checkout/:quoteId/review' },
  {
    path: 'checkout/:quoteId/review',
    canActivate: [authGuard],
    data: { flow: 'checkout-review' },
    loadComponent: () =>
      import('./features/checkout/review.component').then((m) => m.ReviewComponent),
  },
  {
    path: 'checkout/:quoteId/shipping',
    canActivate: [authGuard],
    data: { flow: 'checkout-shipping' },
    loadComponent: () =>
      import('./features/checkout/shipping.component').then((m) => m.ShippingComponent),
  },
  {
    path: 'checkout/:quoteId/payment',
    canActivate: [authGuard],
    data: { flow: 'checkout-payment' },
    loadComponent: () =>
      import('./features/checkout/payment.component').then((m) => m.PaymentComponent),
  },

  {
    path: 'orders',
    canActivate: [authGuard],
    data: { flow: 'orders-list' },
    loadComponent: () =>
      import('./features/orders/order-list.component').then((m) => m.OrderListComponent),
  },
  {
    path: 'orders/:id/confirmation',
    canActivate: [authGuard],
    data: { flow: 'order-confirmation' },
    loadComponent: () =>
      import('./features/checkout/confirmation.component').then((m) => m.ConfirmationComponent),
  },

  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    data: { flow: 'admin' },
    loadComponent: () =>
      import('./features/admin/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'materials' },
      {
        path: 'materials',
        data: { flow: 'admin-materials' },
        loadComponent: () =>
          import('./features/admin/materials.component').then((m) => m.AdminMaterialsComponent),
      },
      {
        path: 'pricing',
        data: { flow: 'admin-pricing' },
        loadComponent: () =>
          import('./features/admin/pricing.component').then((m) => m.AdminPricingComponent),
      },
      {
        path: 'machine',
        data: { flow: 'admin-machine' },
        loadComponent: () =>
          import('./features/admin/machine.component').then((m) => m.AdminMachineComponent),
      },
      { path: 'business', pathMatch: 'full', redirectTo: 'business/branding' },
      {
        path: 'business/branding',
        data: { flow: 'admin-branding' },
        loadComponent: () =>
          import('./features/admin/branding.component').then((m) => m.AdminBrandingComponent),
      },
      {
        path: 'business/payment',
        data: { flow: 'admin-payment' },
        loadComponent: () =>
          import('./features/admin/payment.component').then((m) => m.AdminPaymentComponent),
      },
      {
        path: 'business/shipping',
        data: { flow: 'admin-shipping' },
        loadComponent: () =>
          import('./features/admin/shipping.component').then((m) => m.AdminShippingComponent),
      },
      {
        path: 'settings',
        data: { flow: 'admin-settings' },
        loadComponent: () =>
          import('./features/admin/settings.component').then((m) => m.AdminSettingsComponent),
      },
    ],
  },

  {
    path: '**',
    data: { flow: 'not-found' },
    loadComponent: () =>
      import('./features/not-found.component').then((m) => m.NotFoundComponent),
  },
];
