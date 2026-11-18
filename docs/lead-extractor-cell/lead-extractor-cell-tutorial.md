# Célula Autocontenida de Extracción de Leads (`lead-extractor-cell`)

## 1. Objetivo

Integrar una variante limpia, modular y autocontenida dentro de una carpeta aislada (`lead-extractor-cell/`) en el repositorio [web-leads-extractor](https://github.com/oigonzalezp2024/web-leads-extractor). Esta célula reutiliza la pila base de Node.js, TypeScript y `@libsql/client` para rastrear un sitio web de forma autónoma, localizar información de contacto de clientes (correos electrónicos y teléfonos) dispersa en distintas vistas HTML estáticas, y consolidar los registros sin duplicados en una base de datos SQLite local ubicada de forma segura, exportando posteriormente los resultados a un reporte CSV.

---

## 2. Estructura de Directorios

```text
web-leads-extractor/
├── docs/
│   └── lead-extractor-cell/
│       └── lead-extractor-cell-tutorial.md  # Documentación detallada
├── lead-extractor-cell/                     # 📂 Carpeta raíz de la célula
│   ├── data/                                # 🔒 Carpeta aislada para DB y CSVs (Ignorada por Git)
│   │   ├── clientes_rescatados.db
│   │   └── clientes_consolidados.csv
│   ├── src/
│   │   ├── db/
│   │   │   ├── client.ts                    # Configuración de conexión SQLite / libSQL
│   │   │   └── schema.ts                    # Definición de la tabla client_leads
│   │   ├── tracker/
│   │   │   └── scraper.ts                   # Analizador HTML con Cheerio, Regex y rastreador
│   │   ├── export-leads.ts                  # Módulo de exportación directa a CSV
│   │   └── index.ts                         # Orquestador principal (cola de rastreo)
│   ├── .env                                 # Variables de entorno locales (Ignorado por Git)
│   ├── .env.example                         # Plantilla pública de variables de entorno
│   └── package.json                         # Dependencias y scripts independientes
└── README.md                                # [README] principal del repositorio

```

---

## 3. Guía Paso a Paso para la Instalación y Uso

### Paso 1: Configurar la estructura e instalar dependencias

Navega hasta la raíz de tu repositorio clonado, accede a la célula e instala las librerías necesarias (`cheerio`, `tsx`, `dotenv` y `@libsql/client`):

```bash
cd lead-extractor-cell
pnpm install

```

*(Si pnpm solicita aprobar los builds de `esbuild` durante la instalación, confirma con `Enter`).*

---

### Paso 2: Configurar las variables de entorno

Crea tu archivo `.env` local dentro de `lead-extractor-cell/` basándote en el archivo `.env.example`. Configura la ruta de la base de datos para que apunte automáticamente a la carpeta aislada `data/`:

```env
TURSO_DATABASE_URL="file:data/clientes_rescatados.db"
TARGET_BASE_URL="http://localhost:8080/test-site.html"

```

---

### Paso 3: Configurar la Capa de Datos (libSQL)

1. **`src/db/client.ts`**:
Establece la conexión utilizando la variable de entorno configurada.
```typescript
import 'dotenv/config';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL || 'file:data/clientes_rescatados.db';

export const db = createClient({ url });

```


2. **`src/db/schema.ts`**:
Define la estructura de la tabla con restricción de unicidad para evitar duplicados de contactos.
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

### Paso 4: Implementar el Motor de Scraping y Rastreo

Crea el archivo **`src/tracker/scraper.ts`** para analizar el DOM con `cheerio`, aplicar expresiones regulares para Colombia y extraer enlaces internos del mismo dominio:

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
  const textoCompleto = $('body').text().replace(/\s+/g, ' ');

  // 1. Extracción de correos electrónicos
  const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  for (const email of new Set(textoCompleto.match(regexEmail) || [])) {
    hallazgos.push({
      tipoDato: 'email',
      valor: email.toLowerCase(),
      contexto: extraerContexto(textoCompleto, email),
    });
  }

  // 2. Extracción de teléfonos (Soporte para formato Colombia y estándar)
  const regexTelefono = /(?:\+57\s?)?(?:3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|\(?0?[1-8]\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
  for (const tel of new Set(textoCompleto.match(regexTelefono) || [])) {
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
        urlAbsoluta.hash = '';
        enlacesInternos.add(urlAbsoluta.href);
      }
    } catch {}
  });

  return { hallazgos, enlacesInternos: Array.from(enlacesInternos) };
}

function extraerContexto(texto: string, coincidencia: string): string {
  const index = texto.indexOf(coincidencia);
  if (index === -1) return '';
  return texto.slice(Math.max(0, index - 45), Math.min(texto.length, index + coincidencia.length + 45)).trim();
}

```

---

### Paso 5: Desarrollar el Orquestador Principal (`src/index.ts`)

Controla la cola de rastreo por anchura, respeta límites de seguridad y aplica pausas de cortesía:

```typescript
import 'dotenv/config';
import { db } from './db/client';
import { initSchema } from './db/schema';
import { analizarPagina } from './tracker/scraper';

async function ejecutarRastreo() {
  const baseUrl = process.env.TARGET_BASE_URL;
  if (!baseUrl) throw new Error('Define TARGET_BASE_URL en tu archivo .env');

  await initSchema();

  const visitadas = new Set<string>();
  const cola: string[] = [baseUrl];
  const limitePaginas = 150;

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
        if (!visitadas.has(enlace) && !cola.includes(enlace)) cola.push(enlace);
      }

      await new Promise((resolve) => setTimeout(resolve, 300)); // Pausa de cortesía
    } catch (error) {
      console.error(`Error al procesar ${urlActual}:`, error);
    }
  }

  console.log(`Rastreo finalizado. Total de páginas analizadas: ${visitadas.size}`);
}

ejecutarRastreo();

```

---

### Paso 6: Crear el Exportador a CSV (`src/export-leads.ts`)

Extrae los registros consolidados de la base de datos y los deposita ordenadamente dentro de la carpeta aislada `data/`:

```typescript
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { initSchema } from "./db/schema";

dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:data/clientes_rescatados.db",
});

async function run() {
  await initSchema();

  const { rows } = await client.execute("SELECT url_origen, tipo_dato, valor, contexto FROM client_leads;");
  
  const csv = [
    "url_origen,tipo_dato,valor,contexto",
    ...rows.map(r => `"${r.url_origen}","${r.tipo_dato}","${r.valor}","${r.contexto}"`)
  ].join("\n");

  const outputPath = path.join("data", "clientes_consolidados.csv");
  fs.writeFileSync(outputPath, csv, "utf-8");
  console.log(`¡Exportado con éxito a ${outputPath}!`);
}

run();

```

---

### Paso 7: Configuración de Scripts y Ejecución

1. **Configura los scripts en el `package.json**` de la célula:
```json
"scripts": {
  "track:leads": "tsx src/index.ts",
  "export:leads": "tsx src/export-leads.ts"
}

```


2. **Ejecuta el crawler de leads**:
```bash
pnpm track:leads

```


3. **Exporta el consolidado a CSV**:
```bash
pnpm export:leads

```



---

## 4. Despliegue y Puesta en Marcha

Una vez probada y validada la célula de forma local, tienes dos escenarios principales para ponerla en marcha en producción o servidores de scraping real:

### Escenario A: Puesta en Marcha en Entorno Local o Servidor VPS (Node.js Directo)

Si vas a ejecutar el scraper periódicamente en un servidor propio o máquina dedicada:

1. **Clona o actualiza el repositorio** en el servidor e ingresa a la célula:
```bash
cd web-leads-extractor/lead-extractor-cell

```


2. **Instala las dependencias**:
```bash
pnpm install --frozen-lockfile

```


3. **Crea y configura tu archivo `.env` de producción** apuntando al dominio real del cliente:
```env
TURSO_DATABASE_URL="file:data/clientes_rescatados.db"
TARGET_BASE_URL="https://sitio-web-del-cliente.com"

```


4. **Ejecuta el ciclo completo**:
```bash
pnpm track:leads
pnpm export:leads

```



---

### Escenario B: Automatización mediante Cron Job (Ejecución Periódica)

Si deseas que la célula rastree un sitio web automáticamente todas las madrugadas y genere el reporte sin intervención manual:

1. Abre el editor de crontab en tu servidor:
```bash
crontab -e

```


2. Agrega una tarea programada ajustando las rutas absolutas de tu entorno:
```cron
# Ejecutar el extractor de leads todos los días a las 02:00 AM
0 2 * * * cd /ruta/a/web-leads-extractor/lead-extractor-cell && pnpm track:leads && pnpm export:leads >> /ruta/a/logs/lead-extractor.log 2>&1

```



---

### Consideraciones Clave de Infraestructura:

* **Aislamiento de Datos:** La base de datos SQLite y el reporte CSV se generan dentro de la carpeta local `data/` (excluida por `.gitignore`), asegurando que tus datos extraídos se mantengan seguros en tu servidor local sin riesgo de sobreescrituras al actualizar el código desde GitHub.
* **Respeto al Servidor Objetivo (`Rate Limiting`):** El orquestador cuenta por defecto con una pausa de cortesía de `300ms` entre peticiones (`setTimeout`) para evitar saturar el servidor auditado.
