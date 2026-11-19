# Manual de Usuario: Célula de Extracción de Leads (`lead-extractor-cell`)

## 1. Introducción y Propósito

Este manual describe el procedimiento estándar para desplegar, configurar y ejecutar de forma local la célula **`lead-extractor-cell/`** dentro del repositorio [web-leads-extractor](https://github.com/oigonzalezp2024/web-leads-extractor). Su propósito principal es rastrear páginas web de manera autónoma, extraer información de contacto de clientes potenciales (correos electrónicos y teléfonos con soporte para formato de Colombia) y consolidar los registros en una base de datos SQLite local sin duplicados, exportando posteriormente los hallazgos a un reporte CSV.

---

## 2. Requisitos Previos

* **Node.js** (Versión 22.12.0 o superior) y gestor de paquetes **`pnpm`**.
* Servidor **PHP** (8.0+) disponible en tu entorno o a través de herramientas locales como XAMPP para servir la página de prueba.

---

## 3. Guía Paso a Paso para la Puesta en Marcha

### Paso 1: Sincronizar y preparar el entorno local

1. Clona o actualiza tu rama de desarrollo en tu equipo local:
```bash
git pull origin develop

```


2. Ingresa a la carpeta de la célula:
```bash
cd lead-extractor-cell

```


3. Instala las dependencias del proyecto:
```bash
pnpm install

```



---

### Paso 2: Configurar las Variables de Entorno

Crea tu archivo `.env` local basándote en la plantilla `.env.example`:

```bash
cp .env.example .env

```

Asegúrate de que los parámetros queden configurados de la siguiente manera para apuntar a la carpeta segura de datos y al servidor local:

```env
TURSO_DATABASE_URL="file:data/rescued_leads.db"
TARGET_BASE_URL="http://localhost:8080/test-site.html"

```

---

### Paso 3: Levantar la Página de Prueba con PHP

*(Esto mantendrá el servidor activo en segundo plano simulando el sitio web objetivo del cliente, por lo que se recomienda hacerlo en otra terminal).*

Para que el scraper tenga un entorno HTML estático realista que recorrer (con enlaces internos y datos de contacto simulados), levanta el servidor integrado de PHP apuntando al archivo o directorio de pruebas:

1. Ubícate en la ruta donde tengas tu archivo de prueba HTML (por ejemplo, en la raíz del servidor local de XAMPP o el directorio de pruebas de tu célula).
2. Ejecuta el servidor web incorporado de PHP en el puerto `8080`:
```bash
php -S localhost:8080

```

---

### Paso 4: Ejecutar el Rastreo y Extracción de Leads

Con el servidor PHP activo, abre otra pestaña o ventana de tu terminal, regresa a la ruta `lead-extractor-cell/` y ejecuta el comando de rastreo:

```bash
pnpm track:leads

```

**¿Qué sucede en este paso?**

* Se inicializa automáticamente el esquema de la base de datos SQLite en `data/rescued_leads.db` (utilizando la carpeta segura protegida por el `.gitkeep`).
* El orquestador recorre de forma autónoma las vistas enlazadas (`test-site.html`, `nosotros.html`, `servicios.html`, `contacto.html`, etc.).
* Extrae y limpia los correos y teléfonos aplicando pausas de cortesía de `300ms` entre peticiones.

---

### Paso 5: Exportar los Resultados a CSV

Una vez finalizado el rastreo, genera el reporte consolidado para análisis comercial ejecutando:

```bash
pnpm export:leads

```

El archivo resultante se almacenará de forma limpia y ordenada en la ruta **`data/leads.csv`**, listo para ser abierto en cualquier hoja de cálculo o software de gestión.

---

## 4. Estructura de Control de Versiones e Infraestructura

* **Aislamiento de Datos:** La carpeta `data/` contiene la base de datos local y los reportes CSV generados. Está excluida mediante el archivo `.gitignore` para evitar filtraciones en GitHub, manteniendo únicamente un archivo `.gitkeep` para preservar la existencia de la carpeta.
* **Espacio de trabajo:** El repositorio [web-leads-extractor](https://github.com/oigonzalezp2024/web-leads-extractor) gestiona las compilaciones nativas de paquetes como `esbuild` mediante el archivo `pnpm-workspace.yaml` ubicado en la raíz.
