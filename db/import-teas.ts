import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'
import { assertSafeDbTarget } from './guard'
import { applyPlan, loadExisting, planImport, summarize, validateCsv } from './importer'

// Usage: npm run db:import -- [file.csv] [--dry-run | --apply]
// Dry run is the default and never writes.
const args = process.argv.slice(2)
const apply = args.includes('--apply')
if (apply && args.includes('--dry-run')) {
  console.error('Pass either --dry-run or --apply, not both.')
  process.exit(1)
}
const file = args.find((a) => !a.startsWith('--')) ?? 'db/data/teas.sample.csv'

async function main() {
  // Only --apply writes, so only --apply goes through the production-host guard.
  assertSafeDbTarget(
    apply ? 'db:import --apply' : 'db:import --dry-run',
    apply ? process.env : { ...process.env, ALLOW_PROD_SEED: '1' },
  )

  const { rows, errors } = validateCsv(readFileSync(file, 'utf8'))
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema })
  const plan = planImport(rows, await loadExisting(db))

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${file}`)
  for (const e of errors) console.error(`  line ${e.line}: ${e.message}`)
  console.log(summarize(rows.length, errors, plan))

  if (errors.length > 0) {
    console.error('Fix the errors above; nothing was written.')
    process.exit(1)
  }
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write.')
    return
  }
  const result = await applyPlan(db, plan)
  console.log(`Created ${result.brandsCreated} brands and ${result.teasCreated} teas.`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
