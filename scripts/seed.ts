import { applyMigrations, openDatabase } from '../server/db/client'
import { seedInitialData } from '../server/db/seed'
import { resolveDatabaseFile } from '../server/utils/database'

const DATABASE_FILE = resolveDatabaseFile()

const handle = openDatabase(DATABASE_FILE)
applyMigrations(handle)
seedInitialData(handle.db)
handle.close()

console.log(`Seeded the initial data into ${DATABASE_FILE}`)
