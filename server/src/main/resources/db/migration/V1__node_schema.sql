-- The schema the Node app had built with its Kysely migrations up to 2026-11-24-vacancies, dumped with pg_dump.
-- On a database Node already migrated, Flyway records this version as the baseline and does not run it.

CREATE TYPE public.identity_provider AS ENUM (
    'google',
    'github'
);

CREATE TYPE public.revision_author AS ENUM (
    'user',
    'claude',
    'system'
);

CREATE TYPE public.revision_kind AS ENUM (
    'write',
    'restore'
);

CREATE TYPE public.salary_period AS ENUM (
    'hour',
    'month',
    'year'
);

CREATE TYPE public.seniority AS ENUM (
    'intern',
    'junior',
    'middle',
    'senior',
    'lead'
);

CREATE TYPE public.tag AS ENUM (
    'angular',
    'react',
    'frontend',
    'fullstack'
);

CREATE TYPE public.vacancy_status AS ENUM (
    'saved',
    'applied',
    'interview',
    'offer',
    'rejected',
    'no_reply'
);

CREATE TABLE public.oauth_access_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash bytea NOT NULL,
    family_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_access_tokens_token_hash_check CHECK ((octet_length(token_hash) = 32))
);

CREATE TABLE public.oauth_authorization_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash bytea NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    resource text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_authorization_codes_code_hash_check CHECK ((octet_length(code_hash) = 32))
);

CREATE TABLE public.oauth_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    client_name text,
    redirect_uris text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oauth_clients_redirect_uris_check CHECK ((cardinality(redirect_uris) > 0))
);

CREATE TABLE public.oauth_refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash bytea NOT NULL,
    family_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone,
    CONSTRAINT oauth_refresh_tokens_token_hash_check CHECK ((octet_length(token_hash) = 32))
);

CREATE TABLE public.oauth_token_families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    authorization_code_id uuid NOT NULL,
    resource text NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.resume_revisions (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT revisions_id_not_null NOT NULL,
    resume_id uuid CONSTRAINT revisions_cv_id_not_null NOT NULL,
    number integer CONSTRAINT revisions_number_not_null NOT NULL,
    based_on_id uuid,
    author public.revision_author CONSTRAINT revisions_author_not_null NOT NULL,
    kind public.revision_kind CONSTRAINT revisions_kind_not_null NOT NULL,
    html text CONSTRAINT revisions_cv_html_not_null NOT NULL,
    template_name text CONSTRAINT revisions_template_name_not_null NOT NULL,
    template_version text CONSTRAINT revisions_template_version_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT revisions_created_at_not_null NOT NULL,
    CONSTRAINT resume_revisions_html_check CHECK ((octet_length(html) <= 2097152)),
    CONSTRAINT resume_revisions_number_check CHECK ((number > 0))
);

CREATE TABLE public.resume_tags (
    resume_id uuid CONSTRAINT cv_tags_cv_id_not_null NOT NULL,
    tag public.tag CONSTRAINT cv_tags_tag_not_null NOT NULL
);

CREATE TABLE public.resumes (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT cvs_id_not_null NOT NULL,
    owner_id uuid CONSTRAINT cvs_owner_id_not_null NOT NULL,
    slug text CONSTRAINT cvs_slug_not_null NOT NULL,
    title text CONSTRAINT cvs_title_not_null NOT NULL,
    current_revision_id uuid CONSTRAINT cvs_current_revision_id_not_null NOT NULL,
    pinned_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT cvs_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT cvs_updated_at_not_null NOT NULL,
    CONSTRAINT resumes_slug_format CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 100)))
);

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT sessions_token_hash_check CHECK ((octet_length(token_hash) = 32))
);

CREATE TABLE public.user_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider public.identity_provider NOT NULL,
    provider_user_id text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vacancies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    resume_id uuid,
    sent_revision_id uuid,
    url text,
    company_name text,
    "position" text,
    location text,
    seniority public.seniority,
    salary_min integer,
    salary_max integer,
    salary_currency text,
    salary_period public.salary_period,
    notes text,
    status public.vacancy_status DEFAULT 'saved'::public.vacancy_status NOT NULL,
    applied_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vacancies_salary_currency_format CHECK ((salary_currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT vacancies_salary_max_needs_min CHECK (((salary_max IS NULL) OR (salary_min IS NOT NULL))),
    CONSTRAINT vacancies_salary_needs_currency_and_period CHECK (((salary_min IS NULL) OR ((salary_currency IS NOT NULL) AND (salary_period IS NOT NULL)))),
    CONSTRAINT vacancies_salary_range CHECK (((salary_min >= 0) AND ((salary_max IS NULL) OR (salary_min <= salary_max)))),
    CONSTRAINT vacancies_sent_revision_needs_resume CHECK (((sent_revision_id IS NULL) OR (resume_id IS NOT NULL)))
);

CREATE TABLE public.vacancy_tags (
    vacancy_id uuid NOT NULL,
    tag public.tag NOT NULL
);

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_token_hash_unique UNIQUE (token_hash);

ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_code_hash_unique UNIQUE (code_hash);

ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_client_id_unique UNIQUE (client_id);

ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_refresh_tokens
    ADD CONSTRAINT oauth_refresh_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.oauth_refresh_tokens
    ADD CONSTRAINT oauth_refresh_tokens_token_hash_unique UNIQUE (token_hash);

ALTER TABLE ONLY public.oauth_token_families
    ADD CONSTRAINT oauth_token_families_code_unique UNIQUE (authorization_code_id);

ALTER TABLE ONLY public.oauth_token_families
    ADD CONSTRAINT oauth_token_families_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.resume_revisions
    ADD CONSTRAINT resume_revisions_number_unique UNIQUE (resume_id, number);

ALTER TABLE ONLY public.resume_revisions
    ADD CONSTRAINT resume_revisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.resume_revisions
    ADD CONSTRAINT resume_revisions_resume_id_id_unique UNIQUE (resume_id, id);

ALTER TABLE ONLY public.resume_tags
    ADD CONSTRAINT resume_tags_pk PRIMARY KEY (resume_id, tag);

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_owner_id_id_unique UNIQUE (owner_id, id);

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_owner_slug_unique UNIQUE (owner_id, slug);

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash);

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_provider_user_unique UNIQUE (provider, provider_user_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vacancies
    ADD CONSTRAINT vacancies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vacancies
    ADD CONSTRAINT vacancies_resume_id_unique UNIQUE (resume_id);

ALTER TABLE ONLY public.vacancy_tags
    ADD CONSTRAINT vacancy_tags_pk PRIMARY KEY (vacancy_id, tag);

CREATE INDEX resume_tags_tag_index ON public.resume_tags USING btree (tag);

CREATE INDEX sessions_user_id_index ON public.sessions USING btree (user_id);

CREATE INDEX vacancies_owner_id_index ON public.vacancies USING btree (owner_id);

CREATE INDEX vacancy_tags_tag_index ON public.vacancy_tags USING btree (tag);

ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.oauth_token_families(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_refresh_tokens
    ADD CONSTRAINT oauth_refresh_tokens_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.oauth_token_families(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_token_families
    ADD CONSTRAINT oauth_token_families_authorization_code_id_fkey FOREIGN KEY (authorization_code_id) REFERENCES public.oauth_authorization_codes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_token_families
    ADD CONSTRAINT oauth_token_families_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.oauth_clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.oauth_token_families
    ADD CONSTRAINT oauth_token_families_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resume_revisions
    ADD CONSTRAINT resume_revisions_based_on_fk FOREIGN KEY (resume_id, based_on_id) REFERENCES public.resume_revisions(resume_id, id);

ALTER TABLE ONLY public.resume_revisions
    ADD CONSTRAINT resume_revisions_resume_id_fkey FOREIGN KEY (resume_id) REFERENCES public.resumes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resume_tags
    ADD CONSTRAINT resume_tags_resume_id_fkey FOREIGN KEY (resume_id) REFERENCES public.resumes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_current_revision_fk FOREIGN KEY (id, current_revision_id) REFERENCES public.resume_revisions(resume_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY public.resumes
    ADD CONSTRAINT resumes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vacancies
    ADD CONSTRAINT vacancies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.vacancies
    ADD CONSTRAINT vacancies_resume_owner_fk FOREIGN KEY (owner_id, resume_id) REFERENCES public.resumes(owner_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vacancies
    ADD CONSTRAINT vacancies_sent_revision_fk FOREIGN KEY (resume_id, sent_revision_id) REFERENCES public.resume_revisions(resume_id, id);

ALTER TABLE ONLY public.vacancy_tags
    ADD CONSTRAINT vacancy_tags_vacancy_id_fkey FOREIGN KEY (vacancy_id) REFERENCES public.vacancies(id) ON DELETE CASCADE;
