import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dev-playground',
    loadComponent: () => import('./pages/playground/playground').then((m) => m.Playground),
  },
];
