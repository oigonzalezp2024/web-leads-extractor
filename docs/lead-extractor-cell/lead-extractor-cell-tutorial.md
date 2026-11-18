# Tutorial: Creación de una Célula Autocontenida de Extracción de Leads en el Repositorio

## 1. Objetivo

Integrar una variante limpia y autocontenida dentro de una carpeta aislada (`lead-extractor-cell/`) en el repositorio. Esta célula adapta la pila base de Node.js, TypeScript y libSQL del proyecto para rastrear un sitio web, localizar información de contacto de clientes (correos electrónicos y teléfonos) dispersa en distintas vistas HTML estáticas, y consolidar los registros sin duplicados en una base de datos SQLite local, sin modificar el código original ni los flujos existentes.

---

## 2. Estructura de Directorios

Dentro del repositorio clonado, tu célula aislada se ubica en su propia carpeta:

```text
repositorio/
├── src/                      # Código original intacto
├── lead-extractor-cell/      # <-- Tu célula variante autocontenida
│   ├── src/
│   │   ├── client.ts         # Configuración de conexión SQLite / libSQL local
│   │   ├── schema.ts         # Definición de la tabla client_leads
│   │   ├── scraper.ts        # Analizador HTML con Cheerio, Regex y rastreador de enlaces
│   │   └── index.ts          # Orquestador principal (cola de rastreo y persistencia)
│   ├── .env.example          # Plantilla de variables de entorno para la célula
│   ├── package.json          # Scripts independientes de la célula
│   └── README.md             # Documentación específica de la célula
└── README.md                 # README principal del repositorio

```

---

## 3. Guía Paso a Paso

### Paso 1: Crear el directorio de la célula e instalar dependencias

Navega hasta la raíz de tu repositorio clonado, crea la estructura de carpetas e inicializa el paquete junto con sus dependencias:

```bash
mkdir -p lead-extractor-cell/src/db lead-extractor-cell/src/tracker
cd lead-extractor-cell

```

Crea el archivo `package.json` dentro de `lead-extractor-cell/`:

```json
{
  "name": "lead-extractor-cell",
  "version": "1.0.0",
  "description": "Célula autocontenida para extraer y consolidar leads web dispersos",
  "main": "src/index.ts",
  "scripts": {
    "track:leads": "tsx src/index.ts"
  },
  "dependencies": {
    "@libsql/client": "^0.14.0",
    "cheerio": "^1.0.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.7.1",
    "typescript": "^5.3.3"
  }
}

```

Instala las dependencias:

```bash
pnpm install
pnpm add cheerio tsx dotenv

```

---

### Paso 2: Configurar las variables de entorno (`.env.example` y `.env`)

Crea el archivo `.env.example` dentro de `lead-extractor-cell/`:

```env
TURSO_DATABASE_URL="file:clientes_rescatados.db"
TARGET_BASE_URL="https://sitio-de-tu-cliente.com"

```

Duplica el archivo para generar tu `.env` local:

```bash
cp .env.example .env

```

---

### Paso 3: Implementar el cliente de base de datos y el esquema

Crea `src/db/client.ts` dentro de `lead-extractor-cell/src/`:

```typescript
import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL || 'file:clientes_rescatados.db';

export const db = createClient({
  url,
  // No requiere token de autenticación para uso de archivos SQLite locales
});

```

Crea `src/db/schema.ts` dentro de `lead-extractor-cell/src/`:

```typescript
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

```

---

### Paso 4: Crear el módulo de scraping

Crea `src/tracker/scraper.ts` dentro de `lead-extractor-cell/src/tracker/`:

```typescript
import * as cheerio from 'cheerio';

export interface Hallazgo {
  tipoDato: 'email' | 'telefono';
  valor: string;
  contexto: string;
}

export interface ResultadoPagina {
  hallazgos: Hallazgo[];
  enlacesInternos: string[];
}

export async function analizarPagina(url: string, baseUrl: string): Promise<ResultadoPagina> {
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);

  const hallazgos: Hallazgo[] = [];
  const enlacesInternos = new Set<string>();

  // Extraer el texto del cuerpo normalizando los espacios
  const textoCompleto = $('body').text().replace(/\s+/g, ' ');

  // 1. Extracción de correos electrónicos
  const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = textoCompleto.match(regexEmail) || [];
  for (const email of new Set(emails)) {
    hallazgos.push({
      tipoDato: 'email',
      valor: email.toLowerCase(),
      contexto: extraerContexto(textoCompleto, email),
    });
  }

  // 2. Extracción de teléfonos (soporte para formato Colombia: celular y fijo)
  const regexTelefono = /(?:\+57\s?)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|\(?0?[1-8]\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
  const telefonos = textoCompleto.match(regexTelefono) || [];
  for (const tel of new Set(telefonos)) {
    hallazgos.push({
      tipoDato: 'telefono',
      valor: tel.trim(),
      contexto: extraerContexto(textoCompleto, tel),
    });
  }

  // 3. Descubrimiento de enlaces internos del mismo dominio
  const dominioBase = new URL(baseUrl).origin;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const urlAbsoluta = new URL(href, baseUrl);
      if (urlAbsoluta.origin === dominioBase) {
        urlAbsoluta.hash = ''; // Eliminar fragmentos de anclaje
        enlacesInternos.add(urlAbsoluta.href);
      }
    } catch {
      // Ignorar esquemas que no sean HTTP (mailto:, tel:, javascript:)
    }
  });

  return {
    hallazgos,
    enlacesInternos: Array.from(enlacesInternos),
  };
}

function extraerContexto(texto: string, coincidencia: string): string {
  const index = texto.indexOf(coincidencia);
  if (index === -1) return '';
  const inicio = Math.max(0, index - 45);
  const fin = Math.min(texto.length, index + coincidencia.length + 45);
  return texto.slice(inicio, fin).trim();
}

```

---

### Paso 5: Crear el orquestador principal (`index.ts`)

Crea `src/index.ts` dentro de `lead-extractor-cell/src/`:

```typescript
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

```

---

### Paso 6: Ejecución y Exportación

Ejecuta el crawler de la célula mediante su script independiente:

```bash
pnpm track:leads

```

Una vez finalizado, exporta tu base de datos SQLite a un archivo CSV compatible con Excel:

```bash
sqlite3 -header -csv clientes_rescatados.db "SELECT url_origen, tipo_dato, valor, contexto FROM client_leads;" > clientes_consolidados.csv

```
