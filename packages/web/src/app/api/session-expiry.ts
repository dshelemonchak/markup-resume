import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, throwError } from 'rxjs';

/**
 * Marks a request whose 401 its caller handles itself: the request for the current user, whose 401 is what
 * "signed out" means.
 */
export const HANDLES_OWN_401 = new HttpContextToken(() => false);

/** Counts the 401s the API has answered: each one may mean the session ended (ADR-0027). */
@Injectable({ providedIn: 'root' })
export class SessionExpiry {
  readonly reported = signal(0);

  report(): void {
    this.reported.update((count) => count + 1);
  }
}

/**
 * Reports every 401 from the server, from any request, so the UI asks who is signed in and shows the way to sign
 * in when nobody is. One place for it, instead of a 401 branch beside every call.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const expiry = inject(SessionExpiry);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.context.get(HANDLES_OWN_401)
      ) {
        expiry.report();
      }
      return throwError(() => error);
    }),
  );
};
