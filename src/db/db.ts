import initSqlJs from 'sql.js/dist/sql-asm.js'
import type { Database } from 'sql.js'
import schemaSql from './schema.sql?raw'
import subjectsCsv from '../../data/synthetic.csv?raw'
import paramsCsv from '../../data/params.csv?raw'

// 생성 스크립트가 쓰는 단순 CSV(따옴표·쉼표 포함 값 없음)만 다룬다. 빈 칸은 NULL.
function parseCsv(text: string): { header: string[]; rows: (string | null)[][] } {
  const [head, ...lines] = text.trim().split(/\r?\n/)
  return {
    header: head.split(','),
    rows: lines.map((l) => l.split(',').map((v) => (v === '' ? null : v))),
  }
}

function load(db: Database, table: string, csv: string): void {
  const { header, rows } = parseCsv(csv)
  const stmt = db.prepare(
    `INSERT INTO ${table} (${header.join(', ')}) VALUES (${header.map(() => '?').join(', ')})`,
  )
  for (const r of rows) stmt.run(r)
  stmt.free()
}

export async function openDb(): Promise<Database> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.exec(schemaSql)
  db.exec('BEGIN')
  load(db, 'subjects', subjectsCsv)
  load(db, 'params', paramsCsv)
  db.exec('COMMIT')
  return db
}
