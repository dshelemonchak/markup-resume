import { type Kysely, sql } from 'kysely';

/**
 * Vacancies (ADR-0030): a vacancy and its application in one row, linked to at most one CV and able to exist without
 * one, so applications imported from elsewhere fit. The tag list becomes shared by CVs and vacancies, and the vacancy
 * columns move off resumes.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter type resume_tag rename to tag`.execute(db);
  await db.schema
    .createType('vacancy_status')
    .asEnum(['saved', 'applied', 'interview', 'offer', 'rejected', 'no_reply'])
    .execute();
  await db.schema.createType('seniority').asEnum(['intern', 'junior', 'middle', 'senior', 'lead']).execute();
  await db.schema.createType('salary_period').asEnum(['hour', 'month', 'year']).execute();

  // Lets a vacancy require a CV of its own owner.
  await db.schema
    .alterTable('resumes')
    .addUniqueConstraint('resumes_owner_id_id_unique', ['owner_id', 'id'])
    .execute();

  await db.schema
    .createTable('vacancies')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('owner_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
    .addColumn('resume_id', 'uuid')
    .addColumn('sent_revision_id', 'uuid')
    .addColumn('url', 'text')
    .addColumn('company_name', 'text')
    .addColumn('position', 'text')
    .addColumn('location', 'text')
    .addColumn('seniority', sql`seniority`)
    .addColumn('salary_min', 'integer')
    .addColumn('salary_max', 'integer')
    .addColumn('salary_currency', 'text')
    .addColumn('salary_period', sql`salary_period`)
    .addColumn('notes', 'text')
    .addColumn('status', sql`vacancy_status`, (col) => col.notNull().defaultTo('saved'))
    .addColumn('applied_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    // One CV, one vacancy, for now.
    .addUniqueConstraint('vacancies_resume_id_unique', ['resume_id'])
    // The linked CV belongs to the vacancy's owner.
    .addForeignKeyConstraint(
      'vacancies_resume_owner_fk',
      ['owner_id', 'resume_id'],
      'resumes',
      ['owner_id', 'id'],
      (cb) => cb.onDelete('cascade'),
    )
    // A composite key is not checked while resume_id is null; the check below closes that gap.
    .addForeignKeyConstraint(
      'vacancies_sent_revision_fk',
      ['resume_id', 'sent_revision_id'],
      'resume_revisions',
      ['resume_id', 'id'],
    )
    .addCheckConstraint(
      'vacancies_sent_revision_needs_resume',
      sql`sent_revision_id is null or resume_id is not null`,
    )
    // When salary_max is null, salary_min is the exact rate.
    .addCheckConstraint(
      'vacancies_salary_range',
      sql`salary_min >= 0 and (salary_max is null or salary_min <= salary_max)`,
    )
    .addCheckConstraint('vacancies_salary_max_needs_min', sql`salary_max is null or salary_min is not null`)
    .addCheckConstraint(
      'vacancies_salary_needs_currency_and_period',
      sql`salary_min is null or (salary_currency is not null and salary_period is not null)`,
    )
    .addCheckConstraint('vacancies_salary_currency_format', sql`salary_currency ~ '^[A-Z]{3}$'`)
    .execute();

  // "Every vacancy of this user": the applications table.
  await db.schema.createIndex('vacancies_owner_id_index').on('vacancies').column('owner_id').execute();

  // A vacancy's technologies, from the same list as CV tags.
  await db.schema
    .createTable('vacancy_tags')
    .addColumn('vacancy_id', 'uuid', (col) => col.notNull().references('vacancies.id').onDelete('cascade'))
    .addColumn('tag', sql`tag`, (col) => col.notNull())
    .addPrimaryKeyConstraint('vacancy_tags_pk', ['vacancy_id', 'tag'])
    .execute();

  // "Every vacancy with this technology".
  await db.schema.createIndex('vacancy_tags_tag_index').on('vacancy_tags').column('tag').execute();

  // A CV in the trash takes its vacancy into the trash with it.
  await sql`
    insert into vacancies (owner_id, resume_id, company_name, url, deleted_at)
    select owner_id, id, company_name, vacancy_url, deleted_at
    from resumes
    where company_name is not null or vacancy_url is not null
  `.execute(db);

  await db.schema.alterTable('resumes').dropColumn('company_name').dropColumn('vacancy_url').execute();
}
