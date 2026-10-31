import { templateCatalog } from '@markup-resume/styles';
import { type Kysely, sql } from 'kysely';
import { type DefaultTreeAdapterMap, parse, serialize } from 'parse5';
import {
  type HtmlParser,
  type MarkupElement,
  upgradeLegacyVocabulary,
  validateResumeDocument,
  withTemplateStyles,
} from '../../../domain/index.ts';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

/**
 * The move from "cv" to "resume" (2026-10-31), while there is no hosted data yet: tables, columns, the tag type and
 * the constraints are renamed, and every stored document moves to the new vocabulary and to classic@0.0.3. Each
 * rewritten document goes through the validation boundary; one that fails stops the whole migration, which runs in a
 * single transaction, so nothing changes. Revisions are rewritten in place: their content stays, only the markup's
 * vocabulary changes, so the whole history stays readable and restorable under the current rules.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table cvs rename to resumes`.execute(db);
  await sql`alter table revisions rename to resume_revisions`.execute(db);
  await sql`alter table cv_tags rename to resume_tags`.execute(db);
  await sql`alter type cv_tag rename to resume_tag`.execute(db);

  await sql`alter table resume_revisions rename column cv_id to resume_id`.execute(db);
  await sql`alter table resume_revisions rename column cv_html to html`.execute(db);
  await sql`alter table resume_tags rename column cv_id to resume_id`.execute(db);

  const constraints: readonly (readonly [table: string, from: string, to: string])[] = [
    ['resumes', 'cvs_pkey', 'resumes_pkey'],
    ['resumes', 'cvs_owner_id_fkey', 'resumes_owner_id_fkey'],
    ['resumes', 'cvs_owner_slug_unique', 'resumes_owner_slug_unique'],
    ['resumes', 'cvs_slug_format', 'resumes_slug_format'],
    ['resumes', 'cvs_current_revision_fk', 'resumes_current_revision_fk'],
    ['resume_revisions', 'revisions_pkey', 'resume_revisions_pkey'],
    ['resume_revisions', 'revisions_cv_id_fkey', 'resume_revisions_resume_id_fkey'],
    ['resume_revisions', 'revisions_cv_id_unique', 'resume_revisions_resume_id_id_unique'],
    ['resume_revisions', 'revisions_cv_number_unique', 'resume_revisions_number_unique'],
    ['resume_revisions', 'revisions_based_on_fk', 'resume_revisions_based_on_fk'],
    ['resume_revisions', 'revisions_number_check', 'resume_revisions_number_check'],
    ['resume_revisions', 'revisions_cv_html_check', 'resume_revisions_html_check'],
    ['resume_tags', 'cv_tags_pk', 'resume_tags_pk'],
    ['resume_tags', 'cv_tags_cv_id_fkey', 'resume_tags_resume_id_fkey'],
  ];
  for (const [table, from, to] of constraints) {
    await sql`alter table ${sql.id(table)} rename constraint ${sql.id(from)} to ${sql.id(to)}`.execute(db);
  }
  await sql`alter index cv_tags_tag_index rename to resume_tags_tag_index`.execute(db);

  const revisions = await sql<{ id: string; resume_id: string; number: number; html: string }>`
    select id, resume_id, number, html from resume_revisions
  `.execute(db);
  for (const revision of revisions.rows) {
    const upgraded = upgradeLegacyVocabulary(revision.html);
    const styled = withTemplateStyles(upgraded, templateCatalog);
    const document =
      styled.kind === 'styled'
        ? validateResumeDocument(styled.html, templateCatalog, parseHtml)
        : ({ kind: 'invalid', problems: [styled.problem] } as const);
    if (document.kind === 'invalid') {
      throw new Error(
        `Revision ${revision.number} of resume ${revision.resume_id} does not pass under the new vocabulary:\n` +
          document.problems.map((problem) => `- ${problem}`).join('\n'),
      );
    }
    await sql`
      update resume_revisions
         set html = ${document.html},
             template_name = ${document.template.name},
             template_version = ${document.template.version}
       where id = ${revision.id}
    `.execute(db);
  }
}

/**
 * The parse5 parser as the domain's HtmlParser, kept inside this migration so that it does not depend on code that
 * may change after it ran.
 */
const parseHtml: HtmlParser = (html) => {
  const document = parse(html);
  const root = document.childNodes.find(isElement);
  if (!root) {
    throw new Error('parse5 returned a document without <html>');
  }
  return { tree: toMarkup(root), html: serialize(document) };
};

function toMarkup(element: Element): MarkupElement {
  return {
    tag: element.tagName,
    attributes: new Map(element.attrs.map((attribute) => [attribute.name, attribute.value])),
    children: element.childNodes.filter(isElement).map(toMarkup),
  };
}

function isElement(node: Node): node is Element {
  return 'tagName' in node;
}
