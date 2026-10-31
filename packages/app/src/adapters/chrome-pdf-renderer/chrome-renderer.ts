import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResumeSlug, PageSnapshot, PdfRenderer } from '../../domain/index.ts';
import { ChromeDevToolsPipe } from './chrome-devtools-pipe.ts';

const RENDER_TIMEOUT_MS = 30_000;

/** Text blocks of the snapshot: the innermost of these elements, in document order. */
const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, li, dt, dd';

/** Runs in the page (through CDP, while the page's own scripts are off): what the PDF should contain. */
const SNAPSHOT = `(async () => {
  await document.fonts.ready;
  const selector = ${JSON.stringify(BLOCKS)};
  const blocks = [...document.querySelectorAll(selector)]
    .filter((element) => !element.querySelector(selector))
    .map((element) => element.innerText.replace(/\\s+/g, ' ').trim())
    .filter(Boolean);
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: a.innerText.trim() }));
  return { title: document.title, blocks, links };
})()`;

export interface ChromeRendererOptions {
  /** The Chrome or Chromium binary (CHROME_PATH in the image). */
  readonly chromePath: string;
  /** Where this app answers, as Chrome inside the same container reaches it, e.g. http://localhost:3000. */
  readonly appUrl: string;
}

/**
 * The domain's PdfRenderer port on headless Chromium, one browser per export (ADR-0008): opens the CV from this
 * app's API, so the template's fonts and icons load like in the viewer, lets no other request out, turns the
 * page's scripts off, snapshots the text and links, and prints with the page size the CSS declares.
 */
export function createChromeRenderer({ chromePath, appUrl }: ChromeRendererOptions): PdfRenderer {
  const api = `${appUrl}/api/v1/`;
  return async (id: ResumeSlug) => {
    const profile = await mkdtemp(join(tmpdir(), 'markup-resume-chrome-'));
    const chrome = new ChromeDevToolsPipe(chromePath, [
      '--headless',
      // The container runs Chromium as a normal user without the kernel features its sandbox needs.
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
    ]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Rendering took longer than ${RENDER_TIMEOUT_MS} ms`)),
          RENDER_TIMEOUT_MS,
        );
      });
      return await Promise.race([
        render(chrome, api, `${api}resumes/${encodeURIComponent(id)}/document`),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
      await chrome.close();
      await rm(profile, { recursive: true, force: true });
    }
  };
}

async function render(chrome: ChromeDevToolsPipe, api: string, url: string) {
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = (await chrome.send('Target.attachToTarget', { targetId, flatten: true })) as {
    sessionId: string;
  };
  const send = (method: string, params?: Record<string, unknown>) => chrome.send(method, params, sessionId);

  // Every request pauses here: this app's API goes on, anything else is refused.
  chrome.on('Fetch.requestPaused', (params, eventSession) => {
    if (eventSession !== sessionId) return;
    const { requestId, request } = params as { requestId: string; request: { url: string } };
    void (request.url.startsWith(api)
      ? send('Fetch.continueRequest', { requestId })
      : send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }));
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.enable');

  const loaded = chrome.once('Page.loadEventFired', sessionId);
  const { errorText } = (await send('Page.navigate', { url })) as { errorText?: string };
  if (errorText) throw new Error(`Chrome could not open ${url}: ${errorText}`);
  await loaded;

  const evaluated = (await send('Runtime.evaluate', {
    expression: SNAPSHOT,
    awaitPromise: true,
    returnByValue: true,
  })) as { result: { value: PageSnapshot }; exceptionDetails?: { text: string } };
  if (evaluated.exceptionDetails) throw new Error(`Page snapshot failed: ${evaluated.exceptionDetails.text}`);

  const { data } = (await send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  })) as { data: string };
  return { pdf: new Uint8Array(Buffer.from(data, 'base64')), page: evaluated.result.value };
}
