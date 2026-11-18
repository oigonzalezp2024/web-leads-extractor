import 'dotenv/config';
import { db } from './db/client';
import { initSchema } from './db/schema';
import { analizarPagina } from './tracker/scraper';

async function ejecutarRastreo() {
  const baseUrl = process.env.TARGET_BASE_URL;
  if (!baseUrl) {
    throw new Error('Debes definir TARGET_BASE_URL en tu archivo .env');
  }

  await initSchema();

  const visitadas = new Set<string>();
  const cola: string[] = [baseUrl];
  const limitePaginas = 150; // Límite de seguridad

  console.log(`[Lead Extractor Cell] Iniciando rastreo en: ${baseUrl}`);

  while (cola.length > 0 && visitadas.size < limitePaginas) {
    const urlActual = cola.shift()!;
    if (visitadas.has(urlActual)) continue;

    visitadas.add(urlActual);
    console.log(`[${visitadas.size}] Procesando: ${urlActual}`);

    try {
      const { hallazgos, enlacesInternos } = await analizarPagina(urlActual, baseUrl);

      for (const item of hallazgos) {
        await db.execute({
          sql: `INSERT OR IGNORE INTO client_leads (url_origen, tipo_dato, valor, contexto, fecha_extraccion)
                VALUES (?, ?, ?, ?, ?)`,
          args: [urlActual, item.tipoDato, item.valor, item.contexto, new Date().toISOString()],
        });
      }

      for (const enlace of enlacesInternos) {
        if (!visitadas.has(enlace) && !cola.includes(enlace)) {
          cola.push(enlace);
        }
      }

      // Pausa de cortesía de 300ms
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`Error al procesar ${urlActual}:`, error);
    }
  }

  console.log(`Rastreo finalizado. Total de páginas analizadas: ${visitadas.size}`);
}

ejecutarRastreo();
