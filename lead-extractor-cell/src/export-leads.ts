import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const dbUrl = process.env.TURSO_DATABASE_URL || "TURSO_DATABASE_URL";
// Extraer la ruta limpia para libSQL (removiendo el prefijo "file:")
const client = createClient({ url: dbUrl });

async function run() {
  const { rows } = await client.execute("SELECT url_origen, tipo_dato, valor, contexto FROM client_leads;");
  
  const csv = [
    "url_origen,tipo_dato,valor,contexto",
    ...rows.map(r => `"${r.url_origen}","${r.tipo_dato}","${r.valor}","${r.contexto}"`)
  ].join("\n");

  const outputPath = path.join("data", "leads.csv");
  fs.writeFileSync(outputPath, csv, "utf-8");
  console.log(`¡Exportado con éxito a ${outputPath}!`);
}

run();
