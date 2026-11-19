import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.LEADS_VIEW_PORT || 4173);
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");

interface LeadRegistro {
  url: string;
  correos: string[];
  telefonos: string[];
  celulares: string[];
  linea_original: string;
  fuente?: string;
}

let phpProcess: ReturnType<typeof spawn> | null = null;
let targetBaseUrlOverride =
  process.env.TARGET_BASE_URL || "http://localhost:8080/test-site.html";

process.on("unhandledRejection", (reason) => {
  console.error("[server.ts] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[server.ts] Uncaught Exception:", err);
});

function enviarEventoSSE(
  res: http.ServerResponse,
  evento: string,
  payload: Record<string, unknown>
) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${evento}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function ejecutarComandoStream(
  res: http.ServerResponse,
  args: string[],
  etiqueta: string
): Promise<void> {
  return new Promise((resolve) => {
    const tsxBin = path.join(
      ROOT_DIR,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsx.cmd" : "tsx"
    );
    const cmd = fs.existsSync(tsxBin) ? tsxBin : "tsx";

    enviarEventoSSE(res, "status", {
      state: "running",
      message: `[${new Date().toLocaleTimeString("es-CO")}] Iniciando ${etiqueta}...`,
    });

    const child = spawn(cmd, args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        TARGET_BASE_URL: targetBaseUrlOverride,
        TURSO_DATABASE_URL:
          process.env.TURSO_DATABASE_URL || "file:data/rescued_leads.db",
      },
      shell: process.platform === "win32",
    });

    const emitirLineas = (chunk: Buffer, canal: "stdout" | "stderr") => {
      const texto = chunk.toString("utf8");
      const lineas = texto.split(/\r?\n/).filter((l) => l.length > 0);
      for (const linea of lineas) {
        enviarEventoSSE(res, "log", {
          canal,
          line: `[${new Date().toLocaleTimeString("es-CO")}] ${linea}`,
        });
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => emitirLineas(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => emitirLineas(chunk, "stderr"));

    res.on("close", () => {
      if (!child.killed) {
        try {
          child.kill();
        } catch {
          // Ignora errores si ya terminó
        }
      }
    });

    child.on("close", (code) => {
      const ok = code === 0;
      enviarEventoSSE(res, "done", {
        ok,
        code,
        state: ok ? "done" : "error",
        message: ok
          ? `[${new Date().toLocaleTimeString("es-CO")}] ${etiqueta} finalizado (código ${code}).`
          : `[${new Date().toLocaleTimeString("es-CO")}] ${etiqueta} terminó con error (código ${code}).`,
      });
      if (!res.writableEnded) res.end();
      resolve();
    });

    child.on("error", (err) => {
      enviarEventoSSE(res, "done", {
        ok: false,
        code: 1,
        state: "error",
        message: `[${new Date().toLocaleTimeString("es-CO")}] Fallo al lanzar ${etiqueta}: ${err.message}`,
      });
      if (!res.writableEnded) res.end();
      resolve();
    });
  });
}

function iniciarServidorPhp(docrootRel = "."): { ok: boolean; output: string } {
  if (phpProcess && !phpProcess.killed) {
    return {
      ok: true,
      output: "El servidor PHP ya está activo en http://localhost:8080",
    };
  }

  const safeDocroot = path.resolve(ROOT_DIR, docrootRel);
  if (!safeDocroot.startsWith(ROOT_DIR)) {
    return { ok: false, output: "Ruta de PHP fuera del directorio permitido." };
  }

  try {
    phpProcess = spawn("php", ["-S", "localhost:8080"], {
      cwd: safeDocroot,
      stdio: "pipe",
      shell: process.platform === "win32",
    });

    phpProcess.on("error", (err) => {
      console.error("[server.ts] Error en proceso PHP:", err.message);
      phpProcess = null;
    });

    phpProcess.on("exit", () => {
      phpProcess = null;
    });

    return {
      ok: true,
      output: `Servidor PHP iniciado en http://localhost:8080 (carpeta: ${safeDocroot})`,
    };
  } catch (err) {
    phpProcess = null;
    return {
      ok: false,
      output: `No se pudo iniciar PHP: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function detenerServidorPhp(): { ok: boolean; output: string } {
  if (!phpProcess || phpProcess.killed) {
    return {
      ok: true,
      output: "No hay un proceso PHP activo gestionado por el panel.",
    };
  }
  try {
    phpProcess.kill();
  } catch {
    // Ignora si el proceso ya salió
  }
  phpProcess = null;
  return { ok: true, output: "Servidor PHP detenido." };
}

function normalizarNumero(raw: string): string {
  const limpio = raw.replace(/[^\d+]/g, "").trim();
  const digitos = limpio.replace(/\D/g, "");
  if (digitos.length === 10 && digitos.startsWith("3")) return digitos;
  if (digitos.length === 12 && digitos.startsWith("57")) return `+${digitos}`;
  return limpio;
}

function esCelular(num: string): boolean {
  const digitos = num.replace(/^\+57/, "");
  return /^3\d{9}$/.test(digitos);
}

async function consultarSQLiteLocal(): Promise<LeadRegistro[] | null> {
  const dbUrl =
    process.env.TURSO_DATABASE_URL || "file:data/rescued_leads.db";
  const client = createClient({
    url: dbUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    const tablesRes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const tableName = String(tablesRes.rows[0]?.name ?? "");
    if (!tableName) return null;

    const rowsRes = await client.execute(
      `SELECT * FROM "${tableName}" LIMIT 1000`
    );
    return rowsRes.rows.map((row) => {
      const record = row as Record<string, unknown>;
      const textoCompleto = Object.values(record)
        .filter((v) => v !== null && v !== undefined)
        .join(" ");

      const correosMatch =
        textoCompleto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
      const correos = Array.from(
        new Set(correosMatch.map((c) => c.toLowerCase()))
      );

      const candidatosTel =
        textoCompleto.match(
          /(?:\+?\s*57\s*[-.\s]?)?\b3[0-9]{2}\s*[-.\s]?[0-9]{3}\s*[-.\s]?[0-9]{4}\b/g
        ) ?? [];

      const telefonos = Array.from(
        new Set(
          candidatosTel
            .map(normalizarNumero)
            .filter((n) => n.replace(/\D/g, "").length >= 7)
        )
      );
      const celulares = telefonos.filter(esCelular);

      const urlCandidata =
        String(
          record.url ?? record.origen ?? record.pagina ?? record.source ?? ""
        ) ||
        textoCompleto.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ||
        "";

      return {
        url: urlCandidata,
        correos,
        telefonos,
        celulares,
        linea_original: JSON.stringify(record),
        fuente: `${tableName} (${dbUrl})`,
      };
    });
  } catch {
    return null;
  } finally {
    try {
      client.close();
    } catch {
      // Ignora error al cerrar conexión
    }
  }
}

async function leerDesdeSalidaJSON(): Promise<LeadRegistro[]> {
  const candidatos = [
    path.join(DATA_DIR, "output.json"),
    path.join(DATA_DIR, "motors_limpio.json"),
  ];

  for (const archivo of candidatos) {
    if (!fs.existsSync(archivo)) continue;
    const raw = await fs.promises.readFile(archivo, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        url: String(item.url ?? ""),
        correos: Array.isArray(item.correos) ? item.correos : [],
        telefonos: Array.isArray(item.telefonos) ? item.telefonos : [],
        celulares: Array.isArray(item.celulares) ? item.celulares : [],
        linea_original: String(item.linea_original ?? JSON.stringify(item)),
        fuente: path.basename(archivo),
      }));
    }
  }

  return [];
}

async function obtenerLeads(): Promise<{
  fuente: string;
  targetUrl: string;
  items: LeadRegistro[];
}> {
  const desdeDb = await consultarSQLiteLocal();
  if (desdeDb && desdeDb.length > 0) {
    return {
      fuente: desdeDb[0].fuente ?? "sqlite",
      targetUrl: targetBaseUrlOverride,
      items: desdeDb,
    };
  }

  const items = await leerDesdeSalidaJSON();
  return {
    fuente: items[0]?.fuente ?? "sin-datos",
    targetUrl: targetBaseUrlOverride,
    items,
  };
}

async function listarArchivosData(): Promise<string[]> {
  const baseFiles = [
    "./data/motors.csv",
    "./data/leads.csv",
    "./data/output.json",
    "./data/motors_limpio.json",
  ];

  let encontrados: string[] = [];
  if (fs.existsSync(DATA_DIR)) {
    const entries = await fs.promises.readdir(DATA_DIR, { withFileTypes: true });
    encontrados = entries
      .filter((e) => e.isFile() && /\.(csv|json|txt)$/i.test(e.name))
      .map((e) => `./data/${e.name}`);
  }

  return Array.from(new Set([...baseFiles, ...encontrados]));
}

function leerCuerpoJSON(
  req: http.IncomingMessage
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function prepararStreamSSE(res: http.ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
}

const server = http.createServer((req, res) => {
  void (async () => {
    try {
      const urlPath = (req.url || "/").split("?")[0];

      if (req.method === "GET" && urlPath === "/api/leads") {
        const payload = await obtenerLeads();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(payload));
        return;
      }

      if (req.method === "GET" && urlPath === "/api/data-files") {
        const files = await listarArchivosData();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ files }));
        return;
      }

      if (req.method === "POST" && urlPath === "/api/stream/track") {
        prepararStreamSSE(res);
        await ejecutarComandoStream(res, ["src/index.ts"], "track:leads");
        return;
      }

      if (req.method === "POST" && urlPath === "/api/stream/export") {
        prepararStreamSSE(res);
        await ejecutarComandoStream(res, ["src/export-leads.ts"], "export:leads");
        return;
      }

      if (req.method === "POST" && urlPath === "/api/stream/analyze") {
        const body = await leerCuerpoJSON(req);
        const inputRel = String(body.input || "./data/motors.csv");
        const outputRel = String(body.output || "./data/output.json");
        const safeInput = path.resolve(ROOT_DIR, inputRel);
        const safeOutput = path.resolve(ROOT_DIR, outputRel);

        prepararStreamSSE(res);
        if (!safeInput.startsWith(ROOT_DIR) || !safeOutput.startsWith(ROOT_DIR)) {
          enviarEventoSSE(res, "done", {
            ok: false,
            code: 1,
            state: "error",
            message: "Ruta fuera del directorio permitido.",
          });
          res.end();
          return;
        }

        await ejecutarComandoStream(
          res,
          ["src/analyze-leads.ts", safeInput, safeOutput],
          "analyze:leads"
        );
        return;
      }

      if (req.method === "POST" && urlPath === "/api/actions/php-start") {
        const body = await leerCuerpoJSON(req);
        const result = iniciarServidorPhp(String(body.docroot || "."));
        res.writeHead(result.ok ? 200 : 400, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === "POST" && urlPath === "/api/actions/php-stop") {
        const result = detenerServidorPhp();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === "POST" && urlPath === "/api/actions/target") {
        const body = await leerCuerpoJSON(req);
        if (typeof body.targetUrl === "string" && body.targetUrl.trim()) {
          targetBaseUrlOverride = body.targetUrl.trim();
          process.env.TARGET_BASE_URL = targetBaseUrlOverride;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            ok: true,
            output: `TARGET_BASE_URL activo: ${targetBaseUrlOverride}`,
          })
        );
        return;
      }

      if (req.method === "GET" && urlPath === "/api/download-csv") {
        const csvPath = path.join(DATA_DIR, "leads.csv");
        if (!fs.existsSync(csvPath)) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(
            "Aún no existe data/leads.csv. Ejecuta Exportar CSV primero."
          );
          return;
        }
        const content = await fs.promises.readFile(csvPath, "utf8");
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="leads.csv"',
        });
        res.end(content);
        return;
      }

      const htmlPath = path.join(ROOT_DIR, "index.html");
      if (fs.existsSync(htmlPath)) {
        const html = await fs.promises.readFile(htmlPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Vista index.html no encontrada");
    } catch (err) {
      console.error("[server.ts] Error atendiendo petición:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      }
      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            ok: false,
            output: `Error interno del servidor: ${err instanceof Error ? err.message : String(err)}`,
            items: [],
          })
        );
      }
    }
  })();
});

server.on("error", (err) => {
  console.error("[server.ts] Error en HTTP server:", err);
});

server.listen(PORT, () => {
  console.log(`Panel de control de leads en http://localhost:${PORT}`);
});
