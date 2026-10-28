import type { PdfProblemDto } from '../api/cv-api';

/** How many words or problems a list shows before "and N more". */
const SHOWN = 10;
/** A block quoted in a problem is cut to this many characters. */
const EXCERPT = 60;

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * t(pdfProblem.fontType3, pdfProblem.fontNotEmbedded, pdfProblem.fontNoUnicode, pdfProblem.wordsMissing,
 * pdfProblem.wordsExtra, pdfProblem.blockOutOfOrder, pdfProblem.blockSplit, pdfProblem.linkNotClickable,
 * pdfProblem.moreWords, pdfProblem.moreProblems)
 */

/** One problem of the PDF check (ADR-0019), in the user's language. */
export function pdfProblemText(problem: PdfProblemDto, t: Translate): string {
  switch (problem.code) {
    case 'font-type3':
      return t('pdfProblem.fontType3', { font: problem.font });
    case 'font-not-embedded':
      return t('pdfProblem.fontNotEmbedded', { font: problem.font });
    case 'font-no-unicode':
      return t('pdfProblem.fontNoUnicode', { font: problem.font });
    case 'words-missing':
      return t('pdfProblem.wordsMissing', { words: wordList(problem.words, t) });
    case 'words-extra':
      return t('pdfProblem.wordsExtra', { words: wordList(problem.words, t) });
    case 'block-out-of-order':
      return t('pdfProblem.blockOutOfOrder', { block: excerpt(problem.block) });
    case 'block-split':
      return t('pdfProblem.blockSplit', { block: excerpt(problem.block) });
    case 'link-not-clickable':
      return t('pdfProblem.linkNotClickable', { text: problem.text, href: problem.href });
  }
}

/** The problems as lines for the report: the first few, then how many more. */
export function pdfProblemLines(problems: readonly PdfProblemDto[], t: Translate): string[] {
  const lines = problems.slice(0, SHOWN).map((problem) => pdfProblemText(problem, t));
  if (problems.length > SHOWN) lines.push(t('pdfProblem.moreProblems', { count: problems.length - SHOWN }));
  return lines;
}

function wordList(words: readonly string[], t: Translate): string {
  const list = words
    .slice(0, SHOWN)
    .map((word) => `"${word}"`)
    .join(', ');
  return words.length > SHOWN ? t('pdfProblem.moreWords', { list, count: words.length - SHOWN }) : list;
}

function excerpt(text: string): string {
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT - 3)}…` : text;
}
