import { type Kysely, sql } from 'kysely';

/** Upper bound for one document, in UTF-8 bytes: the same limit as MAX_CV_DOCUMENT_BYTES in the app. */
const MAX_CV_HTML_BYTES = 2 * 1024 * 1024;

/**
 * The first schema (ADR-0025): people and how they sign in, CVs, their revisions and their tags. Migrations only
 * move forward (ADR-0021), so there is no down().
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createType('identity_provider').asEnum(['google', 'github']).execute();
  await db.schema.createType('revision_author').asEnum(['user', 'claude', 'system']).execute();
  await db.schema.createType('revision_kind').asEnum(['write', 'restore']).execute();
  await db.schema.createType('cv_tag').asEnum(['angular', 'react', 'frontend', 'fullstack']).execute();

  // A person. Name and email come from the identity provider at sign-in.
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text')
    .addColumn('email', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // A way to sign in. A person is found by the provider's stable id, never by email.
  await db.schema
    .createTable('user_identities')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', sql`identity_provider`, (col) => col.notNull())
    .addColumn('provider_user_id', 'text', (col) => col.notNull())
    .addColumn('email', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('user_identities_provider_user_unique', ['provider', 'provider_user_id'])
    .execute();

  // A CV. Its content lives in revisions; the foreign key to the current one is added below, once that table exists.
  await db.schema
    .createTable('cvs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('owner_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('slug', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('company_name', 'text')
    .addColumn('vacancy_url', 'text')
    .addColumn('current_revision_id', 'uuid', (col) => col.notNull())
    .addColumn('pinned_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    // A slug stays taken while its CV is in the trash, so the CV can always be restored under it.
    .addUniqueConstraint('cvs_owner_slug_unique', ['owner_id', 'slug'])
    // The same rule as CvId in the domain: lower-case words joined by single hyphens.
    .addCheckConstraint('cvs_slug_format', sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100`)
    .execute();

  // One stored version of a CV document. Revisions are only ever added.
  await db.schema
    .createTable('revisions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('cv_id', 'uuid', (col) => col.notNull().references('cvs.id').onDelete('cascade'))
    .addColumn('number', 'integer', (col) => col.notNull().check(sql`number > 0`))
    .addColumn('based_on_id', 'uuid')
    .addColumn('author', sql`revision_author`, (col) => col.notNull())
    .addColumn('kind', sql`revision_kind`, (col) => col.notNull())
    .addColumn('cv_html', 'text', (col) =>
      col.notNull().check(sql`octet_length(cv_html) <= ${sql.lit(MAX_CV_HTML_BYTES)}`),
    )
    // Copied by the app from the document's cv:template, never set on their own.
    .addColumn('template_name', 'text', (col) => col.notNull())
    .addColumn('template_version', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('revisions_cv_number_unique', ['cv_id', 'number'])
    // Lets other foreign keys require a revision of the same CV.
    .addUniqueConstraint('revisions_cv_id_unique', ['cv_id', 'id'])
    // The revision this one was made from, always of the same CV; null only for the first.
    .addForeignKeyConstraint('revisions_based_on_fk', ['cv_id', 'based_on_id'], 'revisions', ['cv_id', 'id'])
    .execute();

  // The current revision belongs to the same CV. Checked at commit, so a new CV and its first revision can be inserted
  // in one transaction, in that order.
  await db.schema
    .alterTable('cvs')
    .addForeignKeyConstraint(
      'cvs_current_revision_fk',
      ['id', 'current_revision_id'],
      'revisions',
      ['cv_id', 'id'],
      (cb) => cb.deferrable().initiallyDeferred(),
    )
    .execute();

  // A CV's tags, from the fixed list in cv_tag.
  await db.schema
    .createTable('cv_tags')
    .addColumn('cv_id', 'uuid', (col) => col.notNull().references('cvs.id').onDelete('cascade'))
    .addColumn('tag', sql`cv_tag`, (col) => col.notNull())
    .addPrimaryKeyConstraint('cv_tags_pk', ['cv_id', 'tag'])
    .execute();

  // "Every CV with this tag".
  await db.schema.createIndex('cv_tags_tag_index').on('cv_tags').column('tag').execute();
}
