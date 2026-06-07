import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { 
  getOAuth2Client, 
  getAuthUrl, 
  getTaskLists, 
  createTaskList, 
  createTask, 
  uploadMediaToDrive, 
  createGoogleDocFromChat 
} from './services/google.js';
import { 
  extractAndParseZip, 
  cleanTempDir 
} from './services/parser.js';
import { 
  groupMessagesIntoThreads, 
  analyzeChatThread, 
  transcribeAudio, 
  describeImage 
} from './services/gemini.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup for temporary file uploads
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Helper to get mime type
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.opus':
      return 'audio/ogg'; // Google API accepts audio/ogg or audio/opus
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.m4a':
      return 'audio/mp4';
    case '.ogg':
      return 'audio/ogg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Route: Get Google Auth URL
 */
app.get('/api/auth/url', (req, res) => {
  try {
    const oauth2Client = getOAuth2Client();
    const url = getAuthUrl(oauth2Client);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Route: Google OAuth Callback
 */
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Código de autorización faltante.');
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    // Redirect to Vite frontend (usually port 5173 in dev) with tokens
    // In production, this can redirect to the frontend origin.
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/?tokens=${encodeURIComponent(JSON.stringify(tokens))}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error en callback OAuth:', error);
    res.status(500).send(`Error de autenticación: ${error.message}`);
  }
});

/**
 * Route: Fetch User's Google Task Lists
 */
app.post('/api/tasklists', async (req, res) => {
  const { tokens } = req.body;
  if (!tokens) {
    return res.status(401).json({ error: 'Faltan tokens de Google' });
  }

  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const lists = await getTaskLists(oauth2Client);
    res.json(lists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Route: Process WhatsApp ZIP Export (SSE Stream)
 */
app.post('/api/process', upload.single('file'), async (req, res) => {
  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = (status, percent, details = {}) => {
    res.write(`data: ${JSON.stringify({ status, percent, ...details })}\n\n`);
  };

  const file = req.file;
  if (!file) {
    sendProgress('error', 100, { message: 'Archivo no proporcionado.' });
    return res.end();
  }

  // Parse headers or query for credentials
  const tokensRaw = req.headers['google-tokens'] || req.body.tokens;
  const geminiApiKey = req.headers['gemini-api-key'] || req.body.geminiApiKey;
  const tasklistId = req.headers['tasklist-id'] || req.body.tasklistId;
  const docTitle = req.headers['doc-title'] || req.body.docTitle || `Reporte de WhatsApp - ${new Date().toLocaleDateString()}`;

  let tokens;
  try {
    tokens = JSON.parse(tokensRaw);
  } catch (e) {
    sendProgress('error', 100, { message: 'Tokens de Google inválidos o faltantes.' });
    fs.unlinkSync(file.path);
    return res.end();
  }

  if (!geminiApiKey) {
    sendProgress('error', 100, { message: 'Falta la API Key de Gemini.' });
    fs.unlinkSync(file.path);
    return res.end();
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  let tempDir = null;

  try {
    sendProgress('unzipping', 10, { message: 'Extrayendo archivo zip de WhatsApp...' });
    
    // Extract and parse
    const result = extractAndParseZip(file.path);
    tempDir = result.tempDir;
    const { messages, mediaDir } = result;

    sendProgress('parsing', 20, { 
      message: `Conversación leída. Se encontraron ${messages.length} mensajes en total.` 
    });

    if (messages.length === 0) {
      throw new Error('El archivo de conversación está vacío.');
    }

    // Group into threads
    const threads = groupMessagesIntoThreads(messages);
    sendProgress('analyzing', 30, { 
      message: `Conversación agrupada en ${threads.length} hilos de discusión. Iniciando análisis con Gemini...` 
    });

    const allTasks = [];
    const allInfo = [];
    let trivialCount = 0;
    
    // Media files processed cache (to avoid uploading the same image or transcribing same audio twice)
    const mediaProcessed = [];

    // Process each thread
    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      const percent = Math.floor(30 + (i / threads.length) * 40); // 30% to 70% range
      sendProgress('analyzing', percent, { 
        message: `Analizando bloque de chat ${i + 1} de ${threads.length}...` 
      });

      const analysis = await analyzeChatThread(thread, geminiApiKey, (warningMsg) => {
        sendProgress('analyzing', percent, { message: warningMsg });
      });
      
      if (analysis.isTrivial) {
        trivialCount++;
        continue;
      }

      allTasks.push(...(analysis.tasks || []));
      allInfo.push(...(analysis.information || []));

      // Scan thread for attachments that need processing
      for (const msg of thread) {
        if (msg.attachment) {
          const attachmentPath = path.join(mediaDir, msg.attachment);
          
          // Verify the file actually exists in the zip
          if (fs.existsSync(attachmentPath) && !mediaProcessed.some(m => m.originalName === msg.attachment)) {
            const stats = fs.statSync(attachmentPath);
            if (stats.size === 0) {
              sendProgress('media_warning', percent, { message: `Advertencia: El archivo adjunto ${msg.attachment} está vacío (0 bytes). Se omitirá.` });
              continue;
            }

            const mimeType = getMimeType(msg.attachment);
            
            if (mimeType.startsWith('image/')) {
              sendProgress('media_image', percent, { message: `Procesando imagen adjunta: ${msg.attachment}...` });
              
              // 1. Upload image to Drive
              const driveFile = await uploadMediaToDrive(oauth2Client, attachmentPath, mimeType);
              
              // 2. Ask Gemini to describe the image
              const imgBuffer = fs.readFileSync(attachmentPath);
              const description = await describeImage(imgBuffer, mimeType, geminiApiKey);
              
              mediaProcessed.push({
                originalName: msg.attachment,
                fileId: driveFile.fileId,
                webViewLink: driveFile.webViewLink,
                downloadUrl: driveFile.downloadUrl,
                description,
                isImage: true
              });
            } else if (mimeType.startsWith('audio/')) {
              sendProgress('media_audio', percent, { message: `Transcribiendo mensaje de voz adjunto: ${msg.attachment}...` });
              
              // 1. Transcribe audio
              const audioBuffer = fs.readFileSync(attachmentPath);
              const transcript = await transcribeAudio(audioBuffer, mimeType, geminiApiKey);
              
              mediaProcessed.push({
                originalName: msg.attachment,
                transcript,
                isAudio: true
              });
            }
          }
        }
      }
    }

    sendProgress('integrating', 75, { 
      message: `Análisis completo. Se encontraron ${allTasks.length} tareas y ${allInfo.length} notas de información útil. Descargados/descartados ${trivialCount} hilos triviales.` 
    });

    // Determine tasklist ID
    let finalTasklistId = tasklistId;
    if (!finalTasklistId || finalTasklistId === 'new') {
      sendProgress('integrating', 80, { message: 'Creando nueva lista de tareas en Google Tasks...' });
      const newTaskList = await createTaskList(oauth2Client, `WhatsApp Extractor - ${docTitle}`);
      finalTasklistId = newTaskList.id;
    }

    // Create tasks
    const tasksCreated = [];
    if (allTasks.length > 0) {
      sendProgress('integrating', 85, { message: `Creando ${allTasks.length} tareas en Google Tasks...` });
      for (const t of allTasks) {
        const created = await createTask(oauth2Client, finalTasklistId, {
          title: t.title,
          description: t.description,
          inferredDueDate: t.inferredDueDate
        });
        tasksCreated.push({
          title: t.title,
          assignee: t.assignee,
          inferredDueDate: t.inferredDueDate,
          description: t.description,
          id: created.id
        });
      }
    }

    // Create Doc
    sendProgress('integrating', 90, { message: 'Generando Documento de Google...' });
    const docResult = await createGoogleDocFromChat(oauth2Client, {
      docTitle,
      infoItems: allInfo,
      tasksCreated,
      imagesUploaded: mediaProcessed
    });

    sendProgress('completed', 100, {
      message: '¡Proceso completado con éxito!',
      docLink: docResult.webViewLink,
      docId: docResult.documentId,
      tasksCount: tasksCreated.length,
      infoCount: allInfo.length,
      trivialCount
    });

  } catch (error) {
    console.error('Error durante el procesamiento:', error);
    sendProgress('error', 100, { message: `Error durante el procesamiento: ${error.message}` });
  } finally {
    // Cleanup temporary uploaded files
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    // Cleanup unzipped workspace
    if (tempDir) {
      cleanTempDir(tempDir);
    }
    res.end();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Servidor de WhatsApp Extractor corriendo en http://localhost:${PORT}`);
});
