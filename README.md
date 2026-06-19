# WhatsApp Task Agent (Modo Headless / Automatizado)

Esta versión del programa está diseñada para ejecutarse como un **Agente en segundo plano** sin necesidad de interfaz gráfica (Frontend). Se activa automáticamente mediante un **Activador de Google Apps Script** que vigila una carpeta específica de tu Google Drive. Cuando subes un archivo `.zip` de conversación, el agente lo procesa, extrae las tareas a Google Tasks, redacta la minuta en Google Docs (con transcripción de voz e imágenes) y archiva el ZIP automáticamente en Drive.

---

## Estructura del Funcionamiento

```
[ WhatsApp Móvil ] 
       │ (Exportar ZIP)
       ▼
[ Carpeta de Google Drive ] <─── (Vigilada por Google Apps Script cada 5 min)
       │
       ▼ (Envía Webhook con FileID)
[ Agente Webhook (server.js) ] (Descarga ZIP + Analiza con Gemini + Sube multimedia)
       │
       ├─► [ Google Tasks ] (Crea tareas accionables en lista específica)
       ├─► [ Google Docs ] (Redacta minuta estructurada)
       └─► [ Google Drive ] (Archiva el ZIP procesado y guarda imágenes del chat)
```

---

## Guía de Configuración e Inicio

### 1. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz de este directorio (`/Users/dayher/Applications/whatsapp-task-agent/.env`) basado en el archivo [.env.example](file:///Users/dayher/Applications/whatsapp-task-agent/.env.example):

```env
PORT=3001
GEMINI_API_KEY=tu_api_key_fija_aqui

# Credenciales de Google Cloud Console (OAuth 2.0 Web Client)
GOOGLE_CLIENT_ID=tu_cliente_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_secreto_cliente
GOOGLE_REDIRECT_URI=http://localhost:3001/callback
```
*Nota: Asegúrate de que en las credenciales de tu consola de Google Cloud, el URI de redireccionamiento autorizado contenga `http://localhost:3001/callback`.*

---

### 2. Autenticación Inicial de Google (Una sola vez)
Como no hay frontend, utilizaremos una herramienta de terminal para loguearte con Google una única vez. Ejecuta:

```bash
npm run authorize
```

1. La terminal te dará un enlace de autorización. Cópialo y ábrelo en tu navegador.
2. Inicia sesión con la cuenta de Google donde quieras guardar las tareas y documentos.
3. Concede los permisos solicitados.
4. Tras autorizar, verás el mensaje *"¡Autenticación exitosa!"* y la terminal guardará un archivo secreto llamado **`tokens.json`**.
5. *¡Listo!* El servidor renovará estos tokens automáticamente en segundo plano cuando sea necesario.

---

### 3. Exponer el Servidor a Internet (ngrok)
Dado que Google Apps Script se ejecuta en los servidores de Google, no puede enviar solicitudes directamente a `localhost:3001`. Tienes que exponer tu puerto local:

1. Instala ngrok (si no lo tienes) o usa cualquier otra alternativa de túnel.
2. Ejecuta el túnel en tu puerto 3001:
   ```bash
   ngrok http 3001
   ```
3. Copia la URL pública generada (ej. `https://xxxx-xxxx-xxxx.ngrok-free.app`).

---

### 4. Configuración en Google Apps Script
1. Entra a tu Google Drive y crea una carpeta de entrada (ej. `Buzon_WhatsApp_Agente`).
2. Copia el **ID de la carpeta** desde la barra de direcciones de tu navegador (es la parte final de la URL).
3. Entra a [Google Apps Script Console](https://script.google.com/).
4. Crea un **Nuevo Proyecto** y pega el contenido del archivo [google_apps_script.js](file:///Users/dayher/Applications/whatsapp-task-agent/google_apps_script.js).
5. Modifica las variables al principio del script:
   - `var FOLDER_ID = "EL_ID_DE_TU_CARPETA_DE_DRIVE";`
   - `var WEBHOOK_URL = "https://TU_URL_DE_NGROK.ngrok-free.app/api/agent-trigger";`
6. Guarda el proyecto y pulsa el menú de la izquierda **Activadores** (icono de reloj) -> **Añadir activador**:
   - Función a ejecutar: `processWhatsAppFolder`
   - Origen del evento: `Según tiempo`
   - Tipo de activador: `Temporizador de minutos` -> `Cada 5 minutos` (o el intervalo de tu preferencia).
   - Guarda y concede permisos de acceso.

---

## Ejecución del Agente

Inicia tu servidor local:
```bash
npm start
```

A partir de ahora:
1. Exporta cualquier conversación de WhatsApp en formato `.zip` (incluyendo multimedia) y súbela a tu carpeta de Google Drive `Buzon_WhatsApp_Agente`.
2. El activador de Apps Script detectará el archivo zip, llamará a tu servidor local a través de ngrok pasándole el `fileId`.
3. Tu servidor descargará el zip de Drive, lo procesará mediante Gemini, creará la lista de tareas en Google Tasks, redactará la minuta en Google Docs (subiendo imágenes y transcribiendo audios), y finalmente moverá el zip original de WhatsApp a una subcarpeta llamada `Archived` dentro de tu Drive para dejar el buzón limpio.
