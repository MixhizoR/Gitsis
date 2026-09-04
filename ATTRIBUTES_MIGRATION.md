# Modular Attributes Migration (Priority / DAL Level → JSONB)

This project used to hardcode `priority` and `dal_level` as real columns on
`Requirement` and `TestCase`. They are now stored in a single JSONB column
(`attributes`), whose *shape* is described by a new, project-scoped
`AttributeDefinition` table that you can edit at runtime (add new attributes,
change select options, mark something required) with **no schema migration**.

Everything is backward compatible at the API level: requests can still send
`priority` / `dal_level` as flat top-level fields, and responses still return
them flattened onto the top level, alongside a new `attributes` object. So
the existing frontend (forms, filters, tables) keeps working unchanged.

## What changed

- `prisma/schema.prisma`
  - `Requirement.priority`, `Requirement.dal_level`, `TestCase.priority`,
    `TestCase.dal_level` columns removed.
  - `Requirement.attributes` / `TestCase.attributes` (`Json @default("{}")`)
    added.
  - New `AttributeDefinition` model (project-scoped attribute schema).
- `src/attributes.js` — new module: validation/merge engine, default
  (Priority/DAL Level) seed definitions, and the `flatten()` helper that
  keeps API responses backward compatible.
- `src/server.js` — new `GET/POST/PATCH/DELETE /api/projects/:pid/attributes`
  routes; Requirement/TestCase create & update now validate against
  definitions and write to `attributes`; every project gets the two default
  definitions the moment it's created.
- `src/seed.js`, `src/traceability.js` (reqif import, Excel export raw SQL)
  updated to match.

## Priority / DAL Level are no longer hardcoded UI, either

Priority and DAL Level used to have dedicated, fixed dropdowns in the
Requirement/Test forms and dedicated table columns, on top of being "system"
(undeletable) attribute definitions. That's no longer true:

- **DAL Level is no longer seeded by default** on new projects at all. If a
  project wants it, add it back via the Attribute Manager (`select` type,
  options `DAL A`..`DAL E`) — or it may already exist, unprotected, on
  projects created before this change (see the unlock script below).
- **Priority still ships by default** on new projects, but is no longer
  "system"-protected — it can be removed from a project like any other
  attribute if you don't need it.
- The Requirement/Test forms and the requirements/tests tables no longer
  hardcode Priority/DAL columns — they render **one column/field per
  attribute definition** that applies to that entity type, in the order
  you've configured. Add a new attribute and it shows up in the form and
  table automatically; delete one (including Priority or DAL Level) and it
  disappears from both.

## Running the migration on an existing database

Because this project manages its schema with `prisma db push` (no migration
history), moving data out of the old columns before they're dropped needs a
small two-step dump/restore, since `db push` will ask to drop
`priority`/`dal_level` (data loss) when it applies the new schema.

```bash
cd backend

# 1. While the OLD columns still exist in the DB, dump their values.
npm run migrate:attrs:dump

# 2. Regenerate the Prisma Client for the new schema, then push it.
#    This is the step that actually drops priority/dal_level and adds
#    the `attributes` JSONB column + AttributeDefinition table.
npx prisma generate
npx prisma db push

# 3. Restore the dumped values into `attributes`, and backfill the
#    Priority AttributeDefinition row for projects that existed before
#    this migration (new projects get it automatically; DAL Level is not
#    re-added — see step 4).
npm run migrate:attrs:restore

# 4. One-time: unprotect any pre-existing Priority/DAL Level definitions
#    that were saved with the old `system: true` flag, so they can now be
#    deleted from the Attribute Manager if you don't want them.
npm run migrate:attrs:unlock
```

If you're fine losing the existing demo/seed data instead (e.g. a fresh dev
environment), you can skip all of the above and just run:

```bash
docker compose down -v   # wipes the Postgres volume
docker compose up --build
```

`seed.js` will repopulate a fresh project using the new attribute system.

## Adding your own custom attributes

Once migrated, use the API (or the in-app "Attribute Manager") to add
project-specific fields without touching the schema:

```http
POST /api/projects/:pid/attributes
{
  "entityType": "requirement",   // 'requirement' | 'testcase' | 'both'
  "label": "Risk Score",
  "dataType": "number",          // 'text' | 'number' | 'boolean' | 'date' | 'select'
  "required": false
}
```

For a `select` type, include `"options": [{ "value": "Low", "label": "Low" }, ...]`.

Once defined, set/read the value like any other field:

```http
POST /api/projects/:pid/requirements
{ "type": "System Requirement", "title": "...", "attributes": { "risk_score": 7 } }
```

It'll immediately show up as a column in the requirements table and a field
in the requirement form — no further changes needed.
