# Markup Résumé server (Java)

Java 25, Spring Boot 4, Flyway, Postgres. It replaces `packages/app` route by route: both run on the same database,
and Caddy sends each moved route to this server instead of the Node app. Until Node is switched off, it answers only
`/api/health`.

## Commands

From the repository root:

- `docker compose run --rm java ./mvnw verify` — format check, unit and architecture tests, Testcontainers tests.
- `docker compose run --rm java ./mvnw spotless:apply` — format the code.
- `docker compose up app-java` — the server on the dev database, http://localhost:3001/api/health.

## Schema

`V1__node_schema.sql` is the schema Node's Kysely migrations built, dumped with `pg_dump`. On a database Node already
migrated, Flyway records V1 as the baseline and runs nothing; on an empty one it builds the schema from V1.

From now on the schema changes only through Flyway migrations here (`V2__…`); Node's migrations are frozen.

## Layout

The same layers as the Node app, enforced by `ArchitectureTest` instead of ESLint:

- `domain` — types, ports, pure rules; the JDK only.
- `app` — use cases; the domain only.
- `adapters/<role>/<technology>` (e.g. `adapters/storage/postgres`) — never import each other.
- `MarkupResumeApplication` — the composition root.
