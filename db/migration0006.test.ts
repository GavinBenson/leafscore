import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const run = async (client: PGlite, file: string) => {
  const sqlText = readFileSync(`./drizzle/${file}`, 'utf8')
  for (const statement of sqlText.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.exec(statement)
  }
}

const migrationFiles = () => readdirSync('./drizzle').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()

// Applies 0000-0005, seeds legacy data, then applies 0006 on top.
describe('migration 0006 on legacy data', () => {
  async function setup() {
    const client = new PGlite({ extensions: { pg_trgm } })
    const files = migrationFiles()
    const m6 = files.find((f) => f.startsWith('0006_'))!
    for (const f of files.filter((f) => f < '0006')) await run(client, f)

    await client.exec(`
      insert into users (name, email) values ('Ann', 'ann@example.com'), ('Bob', 'bob@example.com');
      insert into teas (name, type, review_count, leaf_score) values ('T1', 'green', 2, 75);
      insert into reviews (user_id, tea_id, score) values (1, 1, 90), (2, 1, 60);
      insert into reports (review_id, reporter_user_id, reason) values (1, 2, 'spam');
    `)
    await run(client, m6)
    const q = async (text: string) => (await client.query(text)).rows as Record<string, unknown>[]
    const fails = async (text: string) => {
      await expect(client.exec(text)).rejects.toThrow()
    }
    return { client, q, fails }
  }

  it('keeps legacy rows and applies defaults', async () => {
    const { q } = await setup()
    expect(await q('select temp_unit, weight_unit, blind_tasting from users order by id')).toEqual([
      { temp_unit: 'c', weight_unit: 'g', blind_tasting: false },
      { temp_unit: 'c', weight_unit: 'g', blind_tasting: false },
    ])
    expect(await q('select id, score, aroma_score, flavor_score, body_score, aftertaste_score, value_score from reviews order by id')).toEqual([
      { id: 1, score: 90, aroma_score: null, flavor_score: null, body_score: null, aftertaste_score: null, value_score: null },
      { id: 2, score: 60, aroma_score: null, flavor_score: null, body_score: null, aftertaste_score: null, value_score: null },
    ])
    expect(await q('select leaf_score, review_count from teas')).toEqual([{ leaf_score: 75, review_count: 2 }])
    expect(await q('select review_id, list_id, reporter_user_id, status from reports')).toEqual([
      { review_id: 1, list_id: null, reporter_user_id: 2, status: 'pending' },
    ])
  })

  it('enforces the user and review checks', async () => {
    const { fails, q } = await setup()
    await fails("update users set temp_unit = 'k' where id = 1")
    await fails("update users set weight_unit = 'lb' where id = 1")
    for (const col of ['aroma_score', 'flavor_score', 'body_score', 'aftertaste_score', 'value_score']) {
      await fails(`update reviews set ${col} = 101 where id = 1`)
      await fails(`update reviews set ${col} = -1 where id = 1`)
    }
    await q("update users set temp_unit = 'f', weight_unit = 'oz', blind_tasting = true where id = 1")
    await q('update reviews set aroma_score = 0, value_score = 100 where id = 1')
  })

  it('enforces the reports exactly-one-target check and uniqueness', async () => {
    const { client, fails, q } = await setup()
    await client.exec("insert into lists (user_id, title, is_public) values (1, 'L', true)")
    expect(await q('select hidden, is_public from lists')).toEqual([{ hidden: false, is_public: true }])

    await fails("insert into reports (reporter_user_id, reason) values (2, 'spam')") // neither
    await fails("insert into reports (review_id, list_id, reporter_user_id, reason) values (2, 1, 2, 'spam')") // both
    await client.exec("insert into reports (list_id, reporter_user_id, reason) values (1, 2, 'spam')")
    await fails("insert into reports (list_id, reporter_user_id, reason) values (1, 2, 'fake')") // unique list+reporter
    await fails("insert into reports (review_id, reporter_user_id, reason) values (1, 2, 'fake')") // unique review+reporter

    // Cascade: deleting the list removes its report but not the review report.
    await client.exec('delete from lists where id = 1')
    expect(await q('select review_id, list_id from reports')).toEqual([{ review_id: 1, list_id: null }])
  })

  it('enforces list, cellar, session and vote constraints and cascades', async () => {
    const { client, fails, q } = await setup()
    await client.exec(`
      insert into lists (user_id, title) values (1, 'L');
      insert into list_items (list_id, tea_id, position) values (1, 1, 1);
      insert into cellar_items (user_id, tea_id, grams) values (1, 1, 10);
      insert into brew_sessions (user_id, tea_id, review_id) values (1, 1, 1);
      insert into brew_infusions (session_id, step, seconds, rating) values (1, 1, 10, 0);
      insert into review_helpful_votes (user_id, review_id) values (2, 1);
    `)
    await fails('insert into list_items (list_id, tea_id, position) values (1, 1, 2)')
    await fails('insert into cellar_items (user_id, tea_id, grams) values (1, 1, 5)')
    await fails('insert into cellar_items (user_id, tea_id, grams) values (2, 1, -1)')
    await fails('insert into cellar_items (user_id, tea_id, grams, low_stock_grams) values (2, 1, 1, -1)')
    await fails('insert into brew_infusions (session_id, step, seconds) values (1, 1, 5)')
    await fails('insert into brew_infusions (session_id, step, seconds) values (1, 2, 0)')
    await fails('insert into brew_infusions (session_id, step, seconds) values (1, 2, 3601)')
    await fails('insert into brew_infusions (session_id, step, seconds, rating) values (1, 2, 5, 101)')
    await fails('insert into review_helpful_votes (user_id, review_id) values (2, 1)')

    // Deleting the review nulls the session link and clears the votes.
    await client.exec('delete from reviews where id = 1')
    expect(await q('select review_id from brew_sessions')).toEqual([{ review_id: null }])
    expect(await q('select count(*)::int as n from review_helpful_votes')).toEqual([{ n: 0 }])

    // Deleting the user cascades through everything they own.
    await client.exec('delete from users where id = 1')
    for (const table of ['lists', 'list_items', 'cellar_items', 'brew_sessions', 'brew_infusions']) {
      expect(await q(`select count(*)::int as n from ${table}`)).toEqual([{ n: 0 }])
    }
  })
})
