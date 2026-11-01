import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ResumeApi } from '../../api/resume-api';
import { ScreenshotResumeApi } from '../screenshot-resume-api';
import { Workspace } from '../workspace/workspace';

/** The real workspace with isolated, fictional data for screenshots. */
@Component({
  selector: 'mr-screenshot-workspace',
  imports: [Workspace],
  providers: [{ provide: ResumeApi, useClass: ScreenshotResumeApi }],
  template: '<mr-workspace />',
  styles: ':host { display: contents; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenshotWorkspace {}
