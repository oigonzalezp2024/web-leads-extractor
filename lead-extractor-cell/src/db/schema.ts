import { db } from './client';

export async function initSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS client_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_origen TEXT NOT NULL,
      tipo_dato TEXT NOT NULL,
      valor TEXT NOT NULL,
      contexto TEXT,
      fecha_extraccion TEXT NOT NULL,
      UNIQUE(tipo_dato, valor)
    )
  `);
}
