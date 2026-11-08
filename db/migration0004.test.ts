import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const run = async (client: PGlite, file: string) => {
  const sqlText = readFileSync(`./drizzle/${file}`, 'utf8')
  for (const statement of sqlText.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.exec(statement)
  }
}

// Applies 0000-0003, loads messy legacy data, then applies the 0004 migration.
describe('migration 0004 on legacy data', () => {
  it('dedupes reviews and brands, backfills, recomputes scores and neutralises names', async () => {
    const client = new PGlite({ extensions: { pg_trgm } })
    for (const f of [
      '0000_bouncy_king_cobra.sql',
      '0001_puzzling_microbe.sql',
      '0002_stripe_events_payment_failed.sql',
      '0003_accounts.sql',
    ]) {
      await run(client, f)
    }

    await client.exec(`
      insert into users (name, email, is_premium) values ('jane', 'jane@example.com', null), ('Real Name', 'r@example.com', false), ('alex', 'alex@x.com', false);
      insert into accounts (user_id, type, provider, provider_account_id) values (3, 'oidc', 'google', 'g-1');
      insert into brands (name) values ('Dup'), ('Dup'), ('Solo');
      insert into teas (name, type, brand_id, review_count) values ('T1', 'green', 2, null), ('T2', 'black', 3, 0);
      insert into flavor_tags (name, category) values ('floral', 'aroma');
      insert into reviews (user_id, tea_id, score, photo_url, created_at) values
        (1, 1, 10, 'https://blob.example/old.jpg', now() - interval '2 days'),
        (1, 1, 90, null, now() - interval '1 day'),
        (2, 1, 60, null, now()),
        (2, 2, 150, null, now());
      insert into review_tags (review_id, flavor_tag_id) values (1, 1), (2, 1);
      insert into stripe_events (id, type) values ('evt_old', 'x');
    `)

    await run(client, '0004_review_integrity_moderation_indexes.sql')

    const q = async (text: string) => (await client.query(text)).rows as Record<string, unknown>[]

    expect(await q('select user_id, tea_id, score from reviews order by id')).toEqual([
      { user_id: 1, tea_id: 1, score: 90 },
      { user_id: 2, tea_id: 1, score: 60 },
      { user_id: 2, tea_id: 2, score: 100 },
    ])
    expect(await q('select review_id from review_tags')).toEqual([{ review_id: 2 }])
    expect(await q('select leaf_score, review_count from teas order by id')).toEqual([
      { leaf_score: 75, review_count: 2 },
      { leaf_score: 100, review_count: 1 },
    ])
    expect(await q('select id, name from brands order by id')).toEqual([
      { id: 1, name: 'Dup' },
      { id: 3, name: 'Solo' },
    ])
    expect(await q('select brand_id from teas order by id')).toEqual([{ brand_id: 1 }, { brand_id: 3 }])
    expect((await q('select is_premium from users where id = 1'))[0].is_premium).toBe(false)
    const names = await q('select name from users order by id')
    expect(names[0].name).toMatch(/^Tea drinker \d{4}$/)
    expect(names[1].name).toBe('Real Name')
    // A Google user whose name equals their email local part keeps it.
    expect(names[2].name).toBe('alex')

    // The deleted older duplicate (review 1) and its tag link are preserved.
    expect(await q('select id, user_id, tea_id, score, photo_url from reviews_dedupe_backup')).toEqual([
      { id: 1, user_id: 1, tea_id: 1, score: 10, photo_url: 'https://blob.example/old.jpg' },
    ])
    expect(await q('select review_id, flavor_tag_id from review_tags_dedupe_backup')).toEqual([
      { review_id: 1, flavor_tag_id: 1 },
    ])
    expect((await q("select processed_at from stripe_events where id = 'evt_old'"))[0].processed_at).not.toBeNull()
  })
})

// db/migrate.ts uses the transactional (neon-serverless) migrator. This shows
// the pattern it relies on: all statements of a migration run in one
// transaction, so a failing statement leaves the database untouched and the
// migration can simply be re-run.
describe('transactional migration', () => {
  it('rolls the whole migration back when a statement fails', async () => {
    const client = new PGlite()
    await client.exec('create table keep (id int)')
    await expect(
      client.transaction(async (tx) => {
        await tx.exec('create table rate_limits (key text primary key)')
        await tx.exec('insert into keep values (1)')
        await tx.exec('this is not sql')
      }),
    ).rejects.toThrow()
    expect((await client.query('select count(*)::int as n from keep')).rows).toEqual([{ n: 0 }])
    const t = await client.query("select to_regclass('rate_limits') as t")
    expect((t.rows[0] as { t: unknown }).t).toBeNull()
  })

  it('db/migrate.ts uses the transactional neon-serverless migrator', () => {
    const src = readFileSync('./db/migrate.ts', 'utf8')
    expect(src).toContain('drizzle-orm/neon-serverless/migrator')
    expect(src).not.toContain('drizzle-orm/neon-http')
    expect(src).toContain('pool.end()')
  })
})
