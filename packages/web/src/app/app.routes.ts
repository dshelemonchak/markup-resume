import type { Routes } from '@angular/router';

/** A screen that is not built yet; `titleKey` is its Transloco title. */
const inDevelopment = (path: string, titleKey: string) => ({
  path,
  loadComponent: () => import('./pages/in-development/in-development').then((m) => m.InDevelopment),
  data: { titleKey },
});

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'cvs',
        loadComponent: () => import('./pages/workspace/workspace').then((m) => m.Workspace),
      },
      inDevelopment('applications', 'nav.applications'),
      inDevelopment('master-file', 'nav.masterFile'),
      inDevelopment('templates', 'nav.templates'),
      inDevelopment('account', 'nav.account'),
      {
        path: 'dev-playground',
        loadComponent: () => import('./pages/playground/playground').then((m) => m.Playground),
      },
    ],
  },
];
