# Manual de Recorrido por Todas las Funcionalidades y Características del Panel (`lead-extractor-cell`)

## Título

Recorrido Operativo Completo y Pasos de Prueba en Local del Panel de Control de `lead-extractor-cell` en [web-leads-extractor](https://github.com/oigonzalezp2024/web-leads-extractor)

---

## Aviso Legal y Uso Responsable

Este proyecto se publica en [web-leads-extractor](https://github.com/oigonzalezp2024/web-leads-extractor/tree/main) con **fines estrictamente académicos, de aprendizaje y experimentación técnica**. El uso que se haga de estas herramientas, el cumplimiento de las normativas aplicables, los términos de servicio de cada sitio y el respeto a la privacidad o a las políticas antispam dependen exclusivamente del usuario. El autor no asume responsabilidad por el uso indebido.

---

## Descripción

Este manual presenta el recorrido paso a paso de todas las funciones, características y **pruebas en local** del [Panel de Control · lead-extractor-cell](http://localhost:4173/) dentro de [lead-extractor-cell](https://github.com/oigonzalezp2024/web-leads-extractor/tree/main/lead-extractor-cell/data) ([web-leads-extractor](https://github.com/oigonzalezp2024/web-leads-extractor/tree/main)), documentado junto con el [Manual de Usuario: Célula de Extracción de Leads ( lead-extractor-cell )](https://github.com/oigonzalezp2024/web-leads-extractor/tree/main/lead-extractor-cell#manual-de-usuario-c%C3%A9lula-de-extracci%C3%B3n-de-leads-lead-extractor-cell). Incluye la preparación del entorno local en [PHP](https://www.php.net/), el rastreo de sitios o archivos locales, la exportación a CSV, el seguimiento en vivo de la consola, el filtrado por columnas en la cabecera de la tabla y el contacto directo por [WhatsApp](https://www.whatsapp.com/) y [Gmail](https://mail.google.com/).

---

## Justificación

Contar con una vista web que unifique la ejecución de comandos (`track:leads`, `analyze:leads`, `export:leads`), la gestión del objetivo (`TARGET_BASE_URL`), el control del servidor local en el puerto `8080`, la inspección de la consola en tiempo real, el filtrado granular por columna y el envío directo por [WhatsApp](https://www.whatsapp.com/) o [Gmail](https://mail.google.com/) evita alternar constantemente entre terminales, bases de datos y hojas de cálculo. Además, permite validar en un entorno local controlado y auditar con rapidez qué registros tienen contacto válido y cuáles provienen de ruido numérico en scripts o archivos PDF enlazados.

---

## Pasos de Prueba en Local

Sigue este procedimiento para probar el flujo completo en tu equipo antes de apuntar hacia sitios externos:

1. **Ubícate en la carpeta de la célula y arranca el panel:**
```bash
cd lead-extractor-cell
pnpm view:leads

```


* Abre [http://localhost:4173/](http://localhost:4173/) y verifica que el indicador de estado muestre **`Listo`**.


2. **Levanta el servidor local en [PHP](https://www.php.net/) y fija la URL de prueba:**
* Haz clic en **`[Levantar PHP (:8080)]`** para iniciar el servidor embebido en `http://localhost:8080`.
* Escribe `http://localhost:8080/test-site.html` en el campo de URL objetivo y haz clic en **`[Aplicar URL Objetivo]`**. Comprueba en **`Salida en vivo del proceso`** que quede activo `TARGET_BASE_URL activo: http://localhost:8080/test-site.html`.


3. **Ejecuta el rastreo local y observa el avance:**
* Pulsa **`[1. Rastrear Leads (track:leads)]`**.
* Observa en tiempo real los logs de rastreo en **`Salida en vivo del proceso`** hasta que el indicador cambie a **`Completado`**.


4. **Prueba el análisis de archivo local (`analyze:leads`):**
* Selecciona un archivo de `./data/` en el selector desplegable (por ejemplo `./data/motors.csv` o `./data/leads.csv`).
* Haz clic en **`[3. Analizar Archivo (analyze:leads)]`** y revisa el resultado en la consola en vivo.


5. **Exporta y descarga el CSV consolidado:**
* Pulsa **`[2. Exportar CSV (export:leads)]`** para generar `data/leads.csv` desde `file:data/rescued_leads.db`.
* Haz clic en **[Descargar CSV](http://localhost:4173/api/download-csv)** y verifica que el archivo se descargue correctamente en tu equipo.


6. **Audita los datos en la tabla y apaga el servidor de prueba:**
* Usa **`[Recargar Datos]`**, prueba los filtros de la cabecera (por ejemplo filtrar **URL** por `test-site.html` o **WHATSAPP** por *Disponible*) y verifica los enlaces de [WhatsApp](https://www.whatsapp.com/) y [Gmail](https://mail.google.com/).
* Al terminar las pruebas locales, haz clic en **`[Detener PHP]`** y en **`[Limpiar consola]`**.



---

## Contenido: Recorrido por Funcionalidades y Características

### 1. Indicador de Estado y Entorno Local (`:8080` y `TARGET_BASE_URL`)

* **Indicador de estado (`Listo`, `Trabajando...`, `Completado`, `Error`):** Muestra en la esquina superior derecha del [Panel de Control · lead-extractor-cell](http://localhost:4173/) si el sistema está en reposo, ejecutando un proceso o si terminó con éxito o error.
* **Control de servidor local en [PHP](https://www.php.net/):** Usa **`[Levantar PHP (:8080)]`** para iniciar el servidor embebido en el puerto `8080` cuando pruebes páginas locales (como `http://localhost:8080/test-site.html`), y **`[Detener PHP]`** para cerrarlo al terminar.
* **URL objetivo (`TARGET_BASE_URL`):** Escribe la ruta o dirección a rastrear en el campo de objetivo (por ejemplo `[https://ejemploxyz.com/](https://ejemploxyz.com/)` o `http://localhost:8080/test-site.html`) y pulsa **`[Aplicar URL Objetivo]`** para actualizar el destino activo antes de rastrear.

### 2. Extracción, Análisis y Exportación de Datos

* **Rastreo autónomo (`[1. Rastrear Leads (track:leads)]`):** Ejecuta el rastreador sobre la URL objetivo, recorre las páginas y enlaces internos aplicando pausas de cortesía de 300ms entre peticiones y guarda correos y teléfonos en [SQLite](https://www.sqlite.org/) (`file:data/rescued_leads.db`, tabla `client_leads`) evitando duplicados.
* **Análisis de archivos (`[3. Analizar Archivo (analyze:leads)]`):** Toma el archivo seleccionado en el desplegable de `./data/` para detectar teléfonos y celulares evitando confundir cifras grandes o precios con números telefónicos.
* **Exportación y descarga CSV:** Pulsa **`[2. Exportar CSV (export:leads)]`** para consolidar los datos de la base local en `data/leads.csv`, y luego usa **[Descargar CSV](http://localhost:4173/api/download-csv)** para bajar el archivo a tu equipo.

### 3. Consola en Vivo y Utilidades de Carga / Copia

* **Consola en vivo (`Salida en vivo del proceso`):** Muestra línea por línea y con marca de hora la salida estándar y los mensajes de error en tiempo real mientras corre cada comando, con auto-scroll y botón **`[Limpiar consola]`**.
* **Actualización y fuentes de datos:** Usa **`[Recargar Datos]`** para volver a leer la fuente activa (`client_leads (file:data/rescued_leads.db)`) o **`*Cargar JSON*`** para abrir manualmente un archivo `.json` y revisarlo en la tabla.
* **Copia rápida de celulares:** Haz clic en **`[Copiar Celulares]`** para copiar al portapapeles los números celulares detectados en los registros visibles.

### 4. Tarjetas de Resumen, Buscador Global y Filtros en la Cabecera de la Tabla

* **Tarjetas de métricas:** Resumen inmediato de **Registros**, **Celulares**, **Teléfonos únicos** y **Fuente activa**.
* **Búsqueda global:** Filtra todos los campos de la tabla desde una sola caja (`Búsqueda global...`) y limpia los filtros de columna con **`[Limpiar filtros de columnas]`**.
* **Filtros por columna en la cabecera:**
* **URL:** Filtra por dominio, ruta o archivo (por ejemplo `test-site.html`, `test-site.com`).
* **CELULARES:** Filtra entre *Todos*, *Con celular* o *Sin celular*.
* **TELÉFONOS:** Filtra por número, prefijo o coincidencia parcial.
* **CORREOS:** Filtra entre *Todos*, *Con correo*, *Sin correo* o *Solo @gmail.com*.
* **WHATSAPP:** Filtra entre *Todos*, *Disponible* o *No disponible* para aislar contactos listos para mensaje o revisar los que no tienen número móvil válido.
* **DETALLE:** Filtra por texto dentro del JSON crudo (`id`, `url_origen`, `tipo_dato`, `valor`, `contexto`, `fecha_extraccion`).



### 5. Acciones por Registro: WhatsApp, Gmail y Auditoría de Detalle

* **Botón directo de [WhatsApp](https://www.whatsapp.com/):** Cada registro con número válido muestra un botón como `WhatsApp · 3150000000` con mensaje inicial prellenado y enlace a la URL de origen; si no aplica, muestra *No disponible*.
* **Redacción autollenada en [Gmail](https://mail.google.com/):** Los correos detectados en **CORREOS** abren la ventana de redacción de [Gmail](https://mail.google.com/) con destinatario (`to`), asunto (`su`) y cuerpo (`body`) prellenados con la dirección y la URL de origen.
* **Columna DETALLE y control de falsos positivos:** Permite inspeccionar el contexto exacto donde se extrajo el dato. Es útil para detectar coincidencias numéricas no comerciales—como porcentajes/valores en estilos o secuencias numéricas de PDFs enlazados—antes de iniciar contacto.

---
