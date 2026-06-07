# Extractor de Tareas e Información de WhatsApp a Google Workspace

Esta es una aplicación web local que analiza la conversación exportada de un grupo de WhatsApp (en formato `.zip`), extrae automáticamente tareas accionables en **Google Tasks**, e inserta información relevante (procedimientos, notas técnicas, resúmenes, etc.) junto con imágenes y transcripciones de audios de voz en un documento de **Google Docs**.

## Características principales

- 📂 **Lector ZIP**: Extrae el chat y sus archivos multimedia de forma transparente.
- 🤖 **Gemini AI**: Clasifica los hilos de conversación de forma inteligente, descartando charlas triviales (saludos, emojis, pláticas informales).
- 🎤 **Transcripción de Voz**: Usa la capacidad multimodal de Gemini para transcribir notas de voz de WhatsApp y guardarlas en el documento de Google.
- 🖼️ **Análisis y Carga de Imágenes**: Sube las imágenes compartidas en el chat a Google Drive y las inserta directamente en el documento con una descripción de su contenido.
- 📋 **Google Tasks**: Crea tareas automáticas con título, contexto y fecha de vencimiento (si se menciona en la plática).
- 📈 **Log en Tiempo Real**: Muestra el progreso detallado de la extracción mediante transmisión SSE en una interfaz de usuario fluida y moderna.

---

## Requisitos Previos y Configuración

### 1. Configuración de Google Cloud (OAuth 2.0)

Para permitir que la aplicación acceda a tus cuentas de Google Tasks y Google Docs, necesitas crear credenciales OAuth 2.0 en Google Cloud Console:

1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un nuevo proyecto (ej. `WhatsApp Extractor`).
3. Ve a **APIs y Servicios** > **Biblioteca** y habilita las siguientes APIs:
   - **Google Tasks API**
   - **Google Docs API**
   - **Google Drive API**
4. Ve a **APIs y Servicios** > **Pantalla de consentimiento de OAuth**:
   - Selecciona **Externo** (User Type) y presiona Crear.
   - Completa la información básica (Nombre de aplicación, correo).
   - En **Permisos (Scopes)**, añade o busca los siguientes alcances:
     - `.../auth/tasks` (Google Tasks API - Ver y gestionar tus tareas)
     - `.../auth/documents` (Google Docs API - Crear y editar documentos)
     - `.../auth/drive.file` (Google Drive API - Subir archivos multimedia del chat)
   - En **Usuarios de prueba (Test users)**, añade tu propia dirección de correo de Google (con la que iniciarás sesión en la aplicación).
5. Ve a **APIs y Servicios** > **Credenciales**:
   - Haz clic en **Crear credenciales** > **ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: `WhatsApp Extractor Local`.
   - En **Orígenes de JavaScript autorizados**, añade:
     - `http://localhost:5173`
   - En **URIs de redireccionamiento autorizados**, añade:
     - `http://localhost:3001/api/auth/callback`
   - Haz clic en **Crear**.
6. Copia el **ID de cliente** y el **Secreto de cliente** generados.

---

### 2. Configurar Variables de Entorno

En el directorio del backend (`/Users/dayher/Applications/whatsapp-task-extractor/backend`), crea un archivo llamado `.env` y copia los valores correspondientes:

```env
# Servidor
PORT=3001
FRONTEND_URL=http://localhost:5173

# Credenciales de Google
GOOGLE_CLIENT_ID=tu_id_de_cliente_aqui.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_secreto_de_cliente_aqui
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/callback
```

---

## Cómo Ejecutar la Aplicación

1. Asegúrate de estar en el directorio raíz del proyecto:
   `cd /Users/dayher/Applications/whatsapp-task-extractor`

2. Instala todas las dependencias del proyecto ejecutando:
   `npm run install-all` (Nota: esto ya se ha realizado durante la inicialización).

3. Inicia la aplicación (servidor de backend y frontend de Vite ejecutándose de forma simultánea):
   `npm run dev`

4. Abre tu navegador en la dirección indicada por Vite:
   `http://localhost:5173`

---

## Cómo Usar la Aplicación

1. **API Key de Gemini**: Consigue una API Key gratuita o de pago en [Google AI Studio](https://aistudio.google.com/) e introdúcela en el primer campo de la aplicación.
2. **Autorización Google**: Presiona el botón "Autorizar Google Workspace" e inicia sesión con el correo que configuraste en Google Cloud.
3. **Lista de Tareas**: Selecciona si deseas crear una lista de tareas nueva específica para esta conversación o añadir las tareas a una lista preexistente.
4. **Archivo ZIP**: Exporta el chat de tu grupo de WhatsApp desde la aplicación móvil:
   - *Android*: Entra al chat > Ajustes (tres puntos) > Más > **Exportar chat** > **Incluir archivos multimedia**.
   - *iOS*: Entra al chat > Toca el nombre del grupo > **Exportar chat** > **Adjuntar archivos**.
   - Transfiere el archivo `.zip` resultante a tu ordenador.
5. **Carga e Inicia**: Arrastra el archivo `.zip` al área de carga y haz clic en **Comenzar Extracción**.
6. **Resultados**: Observa en tiempo real el registro de logs. Al finalizar, podrás abrir directamente el documento creado en Google Docs y ver las tareas añadidas a tu Google Tasks.
