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
