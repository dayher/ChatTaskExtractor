import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

/**
 * Creates a Google OAuth2 client.
 */
export function getOAuth2Client(credentials = {}) {
  const {
    clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'
  } = credentials;

  if (!clientId || !clientSecret) {
    throw new Error('Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en las variables de entorno o la configuración.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates the Google Auth URL for the required scopes.
 */
export function getAuthUrl(oauth2Client) {
  const scopes = [
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive.file'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

/**
 * Fetches and returns task lists for the user.
 */
export async function getTaskLists(auth) {
  const tasks = google.tasks({ version: 'v1', auth });
  const response = await tasks.tasklists.list({ maxResults: 100 });
  return response.data.items || [];
}

/**
 * Creates a new task list.
 */
export async function createTaskList(auth, title) {
  const tasks = google.tasks({ version: 'v1', auth });
  const response = await tasks.tasklists.insert({
    requestBody: { title }
  });
  return response.data;
}

/**
 * Creates a task in a task list.
 */
export async function createTask(auth, tasklistId, { title, description, inferredDueDate }) {
  const tasks = google.tasks({ version: 'v1', auth });
  
  const requestBody = {
    title,
    notes: description
  };

  if (inferredDueDate) {
    // Google Tasks expects due date in RFC 3339 format (YYYY-MM-DDT00:00:00.000Z)
    try {
      const date = new Date(inferredDueDate);
      if (!isNaN(date.getTime())) {
        requestBody.due = date.toISOString();
      }
    } catch (e) {
      console.warn(`No se pudo formatear la fecha de vencimiento: ${inferredDueDate}`);
    }
  }

  const response = await tasks.tasks.insert({
    tasklist: tasklistId,
    requestBody
  });

  return response.data;
}

/**
 * Gets or creates the media upload folder in Google Drive.
 */
async function getOrCreateDriveFolder(drive, folderName = 'WhatsApp Task Extractor Media') {
  // Check if folder exists
  const response = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  // Create folder
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: 'id'
  });

  return folder.data.id;
}

/**
 * Uploads a file to Google Drive and shares it publicly (read-only)
 * so it can be inserted into the Google Doc.
 */
export async function uploadMediaToDrive(auth, filePath, mimeType) {
  const drive = google.drive({ version: 'v3', auth });
  const folderId = await getOrCreateDriveFolder(drive);

  const fileName = path.basename(filePath);
  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filePath)
  };

  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, webContentLink, webViewLink'
  });

  const fileId = file.data.id;

  // Make the file readable by anyone with the link (required for Google Docs API to fetch it)
  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });

  return {
    fileId,
    webViewLink: file.data.webViewLink,
    // Direct download URL that Docs API can fetch
    downloadUrl: `https://docs.google.com/uc?export=download&id=${fileId}`
  };
}

/**
 * Formats and writes information to a new Google Doc.
 * Handles headings, paragraphs, and inline images.
 */
export async function createGoogleDocFromChat(auth, { docTitle, infoItems, tasksCreated, imagesUploaded }) {
  const docs = google.docs({ version: 'v1', auth });

  // 1. Create a blank document
  const doc = await docs.documents.create({
    requestBody: { title: docTitle }
  });
  const documentId = doc.data.documentId;

  // 2. Prepare formatting batch requests
  const requests = [];
  let currentIndex = 1;

  // Helper to add text and update write index
  const appendText = (text, styleType = null) => {
    requests.push({
      insertText: {
        text: text,
        location: { index: currentIndex }
      }
    });

    if (styleType) {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType: styleType },
          range: {
            startIndex: currentIndex,
            endIndex: currentIndex + text.length
          },
          fields: 'namedStyleType'
        }
      });
    }

    currentIndex += text.length;
  };

  // Add Doc Title
  appendText(`${docTitle}\n`, 'TITLE');
  appendText(`Documento generado automáticamente a partir de la conversación de WhatsApp\n`, 'SUBTITLE');
  appendText(`Fecha de procesamiento: ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES')}\n\n`, 'NORMAL_TEXT');

  // Add Section: Informacion Extraida
  if (infoItems && infoItems.length > 0) {
    appendText(`Información Relevante Compartida\n`, 'HEADING_1');
    appendText(`Esta sección resume los datos útiles, enlaces, credenciales y procedimientos compartidos en el grupo.\n\n`, 'NORMAL_TEXT');

    for (const item of infoItems) {
      appendText(`${item.topic}\n`, 'HEADING_2');
      appendText(`${item.summary}\n\n`, 'NORMAL_TEXT');

      // If the info item references attachments that we uploaded
      if (item.relatedAttachments && item.relatedAttachments.length > 0) {
        for (const attachmentName of item.relatedAttachments) {
          const uploadedImage = imagesUploaded.find(img => img.originalName === attachmentName);
          if (uploadedImage && uploadedImage.isImage) {
            // Insert image inline
            requests.push({
              insertInlineImage: {
                uri: uploadedImage.downloadUrl,
                location: { index: currentIndex },
                objectSize: {
                  width: { magnitude: 450, unit: 'PT' }
                }
              }
            });
            // We insert the image, which takes 1 character space in Docs API
            currentIndex += 1;
            
            // Add a line break after the image
            appendText(`\n[Imagen: ${attachmentName} - Detalle: ${uploadedImage.description || 'Sin descripción'}]\n\n`, 'NORMAL_TEXT');
          } else {
            // Check if there is a transcript for this attachment (if it was audio)
            const transcriptText = imagesUploaded.find(img => img.originalName === attachmentName && img.isAudio);
            if (transcriptText) {
              appendText(`🎤 Transcripción de Audio (${attachmentName}):\n`, 'HEADING_3');
              appendText(`"${transcriptText.transcript}"\n\n`, 'NORMAL_TEXT');
            }
          }
        }
      }
    }
  }

  // Add Section: Tareas Creadas
  if (tasksCreated && tasksCreated.length > 0) {
    appendText(`Tareas Creadas en Google Tasks\n`, 'HEADING_1');
    appendText(`Las siguientes tareas fueron identificadas y agregadas automáticamente:\n\n`, 'NORMAL_TEXT');

    for (const task of tasksCreated) {
      appendText(`• [ ] ${task.title}\n`, 'NORMAL_TEXT');
      if (task.assignee) {
        appendText(`  Asignado a: ${task.assignee}\n`, 'NORMAL_TEXT');
      }
      if (task.inferredDueDate) {
        appendText(`  Fecha límite: ${task.inferredDueDate}\n`, 'NORMAL_TEXT');
      }
      if (task.description) {
        // Indent the description lines
        const indentedDesc = task.description.split('\n').map(line => `  ${line}`).join('\n');
        appendText(`  Contexto:\n${indentedDesc}\n`, 'NORMAL_TEXT');
      }
      appendText(`\n`, 'NORMAL_TEXT');
    }
  }

  // 3. Apply all formatting requests to the document in one batch
  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests }
    });
  }

  return {
    documentId,
    webViewLink: `https://docs.google.com/document/d/${documentId}/edit`
  };
}
