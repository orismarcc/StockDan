/**
 * StockDan — Migration runner
 * Roda antes do `next build` via "build": "node scripts/migrate.js && next build"
 *
 * Requer: DATABASE_URL no ambiente (Session pooler do Supabase)
 * Formato: postgresql://postgres.PROJECT:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres
 */

'use strict'

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.log('[migrate] DATABASE_URL não definida — pulando migrations.')
  console.log('[migrate] Configure a variável em .env.local e no Vercel para ativar auto-migrations.')
  process.exit(0) // Não bloqueia o build
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations')

async function main() {
  console.log('[migrate] Conectando ao banco...')

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })

  await client.connect()
  console.log('[migrate] Conectado.\n')

  // Garante que a tabela de controle de migrations existe
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration_history (
      id         SERIAL PRIMARY KEY,
      filename   TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Lê todos os arquivos .sql em ordem
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('[migrate] Nenhum arquivo de migration encontrado.')
    await client.end()
    return
  }

  let applied = 0
  let skipped = 0

  for (const filename of files) {
    // Verifica se já foi aplicado
    const { rows } = await client.query(
      'SELECT id FROM _migration_history WHERE filename = $1',
      [filename]
    )

    if (rows.length > 0) {
      console.log(`  [skip] ${filename}`)
      skipped++
      continue
    }

    // Aplica a migration
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8')
    process.stdout.write(`  [run]  ${filename}... `)

    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        'INSERT INTO _migration_history (filename) VALUES ($1)',
        [filename]
      )
      await client.query('COMMIT')
      console.log('✓')
      applied++
    } catch (err) {
      await client.query('ROLLBACK')
      console.log(`✗\n         Erro: ${err.message}`)
      await client.end()
      process.exit(1) // Bloqueia o build se a migration falhar
    }
  }

  await client.end()

  console.log(`\n[migrate] ${applied} aplicada(s), ${skipped} ignorada(s).`)

  if (applied > 0) {
    console.log('[migrate] Schema atualizado com sucesso.\n')
  }
}

main().catch((err) => {
  console.error('[migrate] Erro fatal:', err.message)
  process.exit(1)
})
