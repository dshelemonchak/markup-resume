import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/workspace/workspace').then((m) => m.Workspace),
  },
  {
    path: 'dev-screenshot',
    loadComponent: () =>
      import('./pages/screenshot-workspace/screenshot-workspace').then((m) => m.ScreenshotWorkspace),
  },
  {
    path: 'dev-playground',
    loadComponent: () => import('./pages/playground/playground').then((m) => m.Playground),
  },
];
