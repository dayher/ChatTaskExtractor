# WhatsApp Workspace Sync Agent (ADK Python SDK)

Este proyecto refactoriza el extractor de tareas de WhatsApp al framework oficial **Google Agent Development Kit (ADK) Python SDK**. Transforma una secuencia estructurada de llamadas en un **Agente de Razonamiento Autónomo** que utiliza `gemini-2.5-flash` para leer, comprender, filtrar y clasificar la información y tareas de tu equipo.

## Características de la versión 2.0 (Basada en Agentes)

- **Optimización de Lectura Inversa (Reverse Parsing)**: Lee el archivo `_chat.txt` de WhatsApp de atrás hacia adelante. Se detiene de inmediato al rebasar el límite cronológico del último procesamiento (`FROM_DATE`), evitando consumir tokens innecesarios.
- **Detección Automática de Rango (Stateless Date Tracking)**: Compara los últimos dos archivos ZIP guardados en Drive (en la carpeta principal y en `"Archived"`). El penúltimo ZIP provee el límite `FROM_DATE` y el último provee el `TO_DATE` para filtrar los chats.
- **Aislamiento de Emisor**: Filtra la conversación para extraer únicamente las tareas e información generada por el `SENDER_OF_INTEREST` (ej. "Dayher").
- **Conversión de Multimedia**: Transcribe notas de voz (.opus, .wav, etc.) y describe capturas/imágenes usando el modelo multimodal Gemini.
- **Creación en Google Workspace**:
  - Crea listas de tareas con fechas límites correspondientes en **Google Tasks**.
  - Crea un reporte ejecutivo formateado en **Google Docs**, subiendo los archivos multimedia asociados a una carpeta de Drive e insertando las imágenes y transcripciones directamente en el documento.

---

## Estructura del Proyecto

```
whatsapp-adk-agent/
├── pyproject.toml              # Manifiesto de dependencias Python
├── .env                        # Configuración local (API Keys, etc.) (Ignorado en git)
├── .env.example                # Plantilla de variables de entorno
├── tokens.json                 # Credenciales Oauth2 autorizadas (Ignorado en git)
├── authorize.py                # Script CLI para autorizar Google OAuth
├── run.py                      # Script CLI para probar el agente localmente
├── google_apps_script.js       # Código del trigger para Google Apps Script
├── app/
│   ├── __init__.py
│   ├── agent.py                # Definición del Agente ADK y sus instrucciones de sistema
│   ├── tools.py                # Herramientas del agente (Drive, Tasks, Docs, transcriptor)
│   ├── auth.py                 # Cargador y refrescador automático de tokens de Google Workspace
│   └── fast_api_app.py         # Servidor FastAPI que expone el endpoint del webhook
```

---

## Guía de Configuración

### 1. Requisitos Previos

Asegúrate de tener instalado `uv` en tu sistema Mac para gestionar el entorno virtual de Python rápidamente.

### 2. Variables de Entorno

Copia el archivo `.env.example` a `.env` y rellena las variables correspondientes:

```bash
cp .env.example .env
```

- **`GEMINI_API_KEY`**: Obtén tu clave en [Google AI Studio](https://aistudio.google.com/).
- **`SENDER_OF_INTEREST`**: Nombre del contacto de WhatsApp cuyas tareas y mensajes deseas procesar (ej: `Dayher`).
- **`GOOGLE_CLIENT_ID`** y **`GOOGLE_CLIENT_SECRET`**: Credenciales Oauth2 de tu proyecto en Google Cloud Console.

### 3. Autenticación con Google Workspace

Coloca tu archivo `client_secret_*.json` (descargado de Google Cloud Console) en la raíz del proyecto o en el directorio superior (`/Users/dayher/Applications/`).

Ejecuta el script de autorización:

```bash
uv run authorize.py
```

Esto levantará un servidor local en el puerto `3001` y abrirá tu navegador para completar la pantalla de consentimiento de Google. Tras dar los permisos de Tasks, Drive y Docs, guardará el archivo `tokens.json` en la raíz.

---

## Cómo Ejecutar y Probar

### Prueba Local (CLI)

Puedes simular una ejecución completa en local con el ID de un archivo ZIP de WhatsApp que tengas en tu Drive:

```bash
uv run run.py <FILE_ID_DE_DRIVE> [NOMBRE_OPCIONAL.zip]
```

El agente:
1. Consultará Drive para calcular el intervalo de fechas.
2. Descargará y parseará en reversa el chat filtrando tu emisor.
3. Transcribirá audios/imágenes si se mencionan.
4. Creará la lista en Google Tasks.
5. Generará el Google Doc.
6. Archivará el ZIP.

---

### Servidor Web (Webhook para Apps Script)

Inicia el servidor FastAPI localmente:

```bash
uv run python app/fast_api_app.py
```

El servidor escuchará en el puerto `8000`.

#### Exponer el Webhook con ngrok

Para permitir que Google Apps Script acceda a tu servidor local, exponlo mediante ngrok:

```bash
ngrok http 8000
```

Copia la URL HTTPS generada (ej. `https://1234-56-78.ngrok-free.app`) y úsala para configurar la URL del webhook en Apps Script.

---

### Configuración del Trigger de Google Apps Script

1. Abre [Google Apps Script](https://script.google.com/).
2. Crea un proyecto y pega el contenido del archivo `google_apps_script.js`.
3. Configura las variables:
   - `FOLDER_ID`: El ID de la carpeta en Google Drive donde subes tus ZIPs exportados de WhatsApp.
   - `WEBHOOK_URL`: `https://TU_URL_DE_NGROK.ngrok-free.app/api/agent-trigger`.
4. Ve a **Activadores** (icono de reloj) -> **Añadir activador**:
   - Elige ejecutar: `processWhatsAppFolder`
   - Origen del evento: `Según tiempo`
   - Tipo de activador: `Temporizador de horas`
   - Intervalo de horas: `Cada 6 horas`
5. Guarda y concede los permisos requeridos.
