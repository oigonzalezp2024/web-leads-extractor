import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL || 'file:clientes_rescatados.db';

export const db = createClient({
  url,
  // No requiere token de autenticación para uso de archivos SQLite locales
});
