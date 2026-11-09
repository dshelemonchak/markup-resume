import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ResumeApi } from '../../api/resume-api';

/** An MCP tool as the landing page lists it; `description` is a Transloco key. */
interface ToolLine {
  readonly name: string;
  readonly description: string;
}

/** t(landing.mcp.tools.list, landing.mcp.tools.readTemplate, landing.mcp.tools.create, landing.mcp.tools.read, landing.mcp.tools.write) */
const TOOLS: readonly ToolLine[] = [
  { name: 'list_resumes', description: 'landing.mcp.tools.list' },
  { name: 'read_template', description: 'landing.mcp.tools.readTemplate' },
  { name: 'create_resume', description: 'landing.mcp.tools.create' },
  { name: 'read_resume', description: 'landing.mcp.tools.read' },
  { name: 'write_resume', description: 'landing.mcp.tools.write' },
];

/** t(landing.pdf.checks.words, landing.pdf.checks.order, landing.pdf.checks.links, landing.pdf.checks.fonts) */
const PDF_CHECKS: readonly string[] = [
  'landing.pdf.checks.words',
  'landing.pdf.checks.order',
  'landing.pdf.checks.links',
  'landing.pdf.checks.fonts',
];

/**
 * Start page: what the product does and the way to sign in. A signed-in visitor goes straight on to the CVs; this is
 * also where GitHub's callback sends the browser, with `?signIn=failed` or `?signIn=not-allowed` when signing in did
 * not work (ADR-0027).
 */
@Component({
  selector: 'mr-landing',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  private readonly api = inject(ResumeApi);
  private readonly router = inject(Router);

  /** How the last sign-in ended, when it did not end in a session. */
  private readonly signInOutcome = new URLSearchParams(inject(DOCUMENT).location.search).get('signIn');
  /** The sign-in did not work. */
  protected readonly signInFailed = this.signInOutcome === 'failed';
  /** The GitHub account is not on this server's allowlist. */
  protected readonly signInNotAllowed = this.signInOutcome === 'not-allowed';

  protected readonly tools = TOOLS;
  protected readonly pdfChecks = PDF_CHECKS;

  constructor() {
    // Only a confirmed user: while the user reloads (right after signing out) the old value is still there.
    effect(() => {
      if (this.api.currentUser.status() === 'resolved') {
        void this.router.navigateByUrl('/cvs', { replaceUrl: true });
      }
    });
  }
}
