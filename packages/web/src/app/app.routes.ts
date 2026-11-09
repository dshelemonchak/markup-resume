import type { Routes } from '@angular/router';
import type { Section } from './pages/in-development-section';

/** A screen that is not built yet, shown by the stand-in page for its section. */
const inDevelopment = (path: string, section: Section) => ({
  path,
  loadComponent: () => import('./pages/in-development/in-development').then((m) => m.InDevelopment),
  data: { section },
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
      inDevelopment('applications', 'applications'),
      inDevelopment('master-file', 'masterFile'),
      inDevelopment('templates', 'templates'),
      inDevelopment('account', 'account'),
      {
        path: 'dev-playground',
        loadComponent: () => import('./pages/playground/playground').then((m) => m.Playground),
      },
    ],
  },
];
