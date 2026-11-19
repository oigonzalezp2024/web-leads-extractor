import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

export interface ContactoTelefono {
  url: string;
  telefonos: string[];
  celulares: string[];
  linea_original: string;
}

const RE_URL = /"(https?:\/\/[^"]+)"/;

const RE_CAMPO_TELEFONO =
  /(?:telefono|teléfono|celular|cel|movil|móvil|tel|phone|whatsapp)\s*[:=]\s*["']?([+()0-9\s.-]{7,20})["']?/gi;

const RE_CANDIDATO_TEL =
  /(?:\+?\s*57\s*[-.\s]?)?\b(3[0-9]{2}|60[1-8]|7|8|[1-9])\s*[-.\s]?[0-9]{3}\s*[-.\s]?[0-9]{2,4}\b/g;

function limpiarTelefono(raw: string): string {
  return raw.replace(/[^\d+]/g, "").trim();
}

function esCelularColombia(numero: string): boolean {
  const soloDigitos = numero.replace(/^\+57/, "");
  return /^3\d{9}$/.test(soloDigitos);
}

function esTelefonoValido(raw: string): boolean {
  const limpio = limpiarTelefono(raw);
  const soloDigitos = limpio.replace(/\D/g, "");

  if (soloDigitos.length < 7 || soloDigitos.length > 13) {
    return false;
  }

  if (limpio.startsWith("+57") && soloDigitos.length !== 12) {
    return false;
  }

  if (
    !limpio.startsWith("+57") &&
    soloDigitos.length >= 8 &&
    !soloDigitos.startsWith("3") &&
    !soloDigitos.startsWith("60")
  ) {
    return false;
  }

  return true;
}

function normalizarNumero(raw: string): string {
  const limpio = limpiarTelefono(raw);
  const soloDigitos = limpio.replace(/\D/g, "");

  if (soloDigitos.length === 10 && soloDigitos.startsWith("3")) {
    return soloDigitos;
  }
  if (soloDigitos.length === 12 && soloDigitos.startsWith("57")) {
    return `+${soloDigitos}`;
  }
  return limpio;
}

export function extraerTelefonosLinea(linea: string): ContactoTelefono {
  const limpia = linea.trim();
  const url = limpia.match(RE_URL)?.[1] ?? "";
  const encontrados = new Set<string>();

  for (const match of limpia.matchAll(RE_CAMPO_TELEFONO)) {
    const candidato = match[1];
    if (candidato && esTelefonoValido(candidato)) {
      encontrados.add(normalizarNumero(candidato));
    }
  }

  for (const match of limpia.matchAll(RE_CANDIDATO_TEL)) {
    const candidato = match[0];
    if (candidato && esTelefonoValido(candidato)) {
      encontrados.add(normalizarNumero(candidato));
    }
  }

  const telefonos = Array.from(encontrados);
  const celulares = telefonos.filter((num) => esCelularColombia(num));

  return {
    url,
    telefonos,
    celulares,
    linea_original: limpia,
  };
}

async function leerArchivoContactos(rutaArchivo: string): Promise<ContactoTelefono[]> {
  const stream = fs.createReadStream(rutaArchivo, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  const resultados: ContactoTelefono[] = [];
  for await (const linea of rl) {
    if (linea.trim() === "") continue;
    const item = extraerTelefonosLinea(linea);
    if (item.telefonos.length > 0) {
      resultados.push(item);
    }
  }

  return resultados;
}

function obtenerArgumentos(argv: string[]): { entrada: string; salida: string } {
  let entrada = "./data/motors.csv";
  let salida = "./data/output.json";
  const posicionales: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--in" || arg === "-i") && argv[i + 1]) {
      entrada = argv[i + 1];
      i++;
    } else if ((arg === "--out" || arg === "-o") && argv[i + 1]) {
      salida = argv[i + 1];
      i++;
    } else if (!arg.startsWith("-")) {
      posicionales.push(arg);
    }
  }

  if (posicionales.length > 0 && !argv.includes("--in") && !argv.includes("-i")) {
    entrada = posicionales[0];
  }
  if (posicionales.length > 1 && !argv.includes("--out") && !argv.includes("-o")) {
    salida = posicionales[1];
  }

  return { entrada, salida };
}

async function main(): Promise<void> {
  const { entrada, salida } = obtenerArgumentos(process.argv.slice(2));

  try {
    const contactos = await leerArchivoContactos(entrada);
    console.log(`Se encontraron ${contactos.length} líneas con teléfonos/celulares en "${entrada}":\n`);

    for (const c of contactos) {
      console.log(
        `- URL: ${c.url || "(sin url)"} | Celulares: [${c.celulares.join(", ")}] | Todos: [${c.telefonos.join(", ")}]`
      );
    }

    await fs.promises.mkdir(path.dirname(path.resolve(salida)), { recursive: true });
    await fs.promises.writeFile(salida, JSON.stringify(contactos, null, 2), "utf8");
    console.log(`\nResultado guardado exitosamente en "${salida}"`);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`Error procesando el archivo: ${mensaje}`);
    process.exitCode = 1;
  }
}

void main();
