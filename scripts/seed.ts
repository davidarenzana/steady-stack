import { applyMigrations, openDatabase } from '../server/db/client'
import { seedInitialData } from '../server/db/seed'

const DATABASE_FILE = 'data/steady-stack.db'

const handle = openDatabase(DATABASE_FILE)
applyMigrations(handle)
seedInitialData(handle.db)
handle.close()

console.log(`Seeded the initial data into ${DATABASE_FILE}`)
