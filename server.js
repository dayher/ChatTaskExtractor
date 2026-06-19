import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { 
  getAuthClient, 
  downloadFileFromDrive, 
  archiveDriveFile,
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

// Webhook parser
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      return 'audio/ogg';
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
 * Webhook: Triggered by Google Apps Script
 * Receives: { fileId, fileName }
 */
app.post('/api/agent-trigger', async (req, res) => {
  const { fileId, fileName } = req.body;

  if (!fileId) {
    console.error('❌ Error: Webhook invocado sin fileId.');
    return res.status(400).json({ success: false, error: 'Falta el parámetro fileId.' });
  }

  const cleanFileName = fileName || `whatsapp_chat_${Date.now()}`;
  console.log(`\n🚀 Webhook activado para procesar: "${cleanFileName}" (ID: ${fileId})`);

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ Error: GEMINI_API_KEY no configurada en el archivo .env.');
    return res.status(500).json({ success: false, error: 'Falta la API Key de Gemini en el servidor.' });
  }

  // Create unique temporary paths
  const tempDownloadDir = '/tmp/whatsapp-agent-downloads';
  if (!fs.existsSync(tempDownloadDir)) {
    fs.mkdirSync(tempDownloadDir, { recursive: true });
  }
  const tempZipPath = path.join(tempDownloadDir, `${fileId}.zip`);

  let tempExtractionDir = null;
  let auth = null;

  try {
    // 1. Initialize Google Auth client from tokens.json
    console.log('🔄 Inicializando credenciales de Google Workspace...');
    auth = getAuthClient();

    // 2. Download file from Google Drive
    console.log(`⬇️ Descargando archivo desde Google Drive...`);
    await downloadFileFromDrive(auth, fileId, tempZipPath);
    console.log('✅ Archivo ZIP descargado temporalmente.');

    // 3. Extract and parse chat
    console.log('📂 Extrayendo y parseando conversación...');
    const result = extractAndParseZip(tempZipPath);
    tempExtractionDir = result.tempDir;
    const { messages, mediaDir } = result;

    console.log(`💬 Conversación leída: ${messages.length} mensajes encontrados.`);
    if (messages.length === 0) {
      throw new Error('El archivo de conversación está vacío.');
    }

    // 4. Group into threads
    const threads = groupMessagesIntoThreads(messages);
    console.log(`📦 Hilos agrupados: ${threads.length} hilos de discusión.`);

    const allTasks = [];
    const allInfo = [];
    let trivialCount = 0;
    const mediaProcessed = [];

    // 5. Process each thread with Gemini
    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      console.log(`🤖 Analizando bloque ${i + 1}/${threads.length} con Gemini...`);

      const analysis = await analyzeChatThread(thread, geminiApiKey, (warningMsg) => {
        console.warn(`⚠️ Gemini Advertencia: ${warningMsg}`);
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
          
          if (fs.existsSync(attachmentPath) && !mediaProcessed.some(m => m.originalName === msg.attachment)) {
            const stats = fs.statSync(attachmentPath);
            if (stats.size === 0) {
              console.log(`📎 Omitiendo adjunto vacío (0 bytes): "${msg.attachment}"`);
              continue;
            }

            const mimeType = getMimeType(msg.attachment);
            
            if (mimeType.startsWith('image/')) {
              console.log(`🖼️ Procesando imagen: "${msg.attachment}"...`);
              const driveFile = await uploadMediaToDrive(auth, attachmentPath, mimeType);
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
              console.log(`🎤 Transcribiendo audio: "${msg.attachment}"...`);
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

    console.log(`📊 Análisis completo: ${allTasks.length} tareas, ${allInfo.length} notas de info. ${trivialCount} hilos triviales omitidos.`);

    // 6. Create TaskList in Google Tasks
    const docTitle = cleanFileName.replace('.zip', '');
    console.log('📋 Creando lista de tareas en Google Tasks...');
    const newTaskList = await createTaskList(auth, `WhatsApp Agent - ${docTitle}`);
    const tasklistId = newTaskList.id;

    // Create tasks
    const tasksCreated = [];
    for (const t of allTasks) {
      const created = await createTask(auth, tasklistId, {
        title: t.title,
        description: t.description,
        inferredDueDate: t.inferredDueDate
      });
      tasksCreated.push({
        title: t.title,
        id: created.id
      });
    }
    console.log(`✅ ${tasksCreated.length} tareas agregadas con éxito.`);

    // 7. Create Google Doc
    console.log('📝 Generando documento de Google Docs...');
    const docResult = await createGoogleDocFromChat(auth, {
      docTitle: `Reporte de WhatsApp - ${docTitle}`,
      infoItems: allInfo,
      tasksCreated: allTasks, // Send original array to write context
      imagesUploaded: mediaProcessed
    });
    console.log(`✅ Documento creado con éxito: ${docResult.webViewLink}`);

    // 8. Move ZIP to Archived folder in Google Drive
    console.log('🗂️ Archivando archivo ZIP en Google Drive...');
    await archiveDriveFile(auth, fileId);

    console.log('🎉 ¡Proceso del agente completado con éxito!');
    res.json({
      success: true,
      docLink: docResult.webViewLink,
      tasksCreated: tasksCreated.length,
      infoCreated: allInfo.length,
      trivialDiscarded: trivialCount
    });

  } catch (error) {
    console.error('❌ Error de procesamiento del agente:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    // Cleanup files
    if (fs.existsSync(tempZipPath)) {
      fs.unlinkSync(tempZipPath);
    }
    if (tempExtractionDir) {
      cleanTempDir(tempExtractionDir);
    }
  }
});

// Start webhook listener
app.listen(PORT, () => {
  console.log(`🤖 Agente de WhatsApp escuchando webhooks en http://localhost:${PORT}`);
  console.log(`🔗 Endpoint de trigger: http://localhost:${PORT}/api/agent-trigger`);
});
