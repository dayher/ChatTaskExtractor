import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

/**
 * Loads tokens from tokens.json and returns an authenticated OAuth2 client.
 */
export function getAuthClient() {
  const tokenPath = path.resolve('tokens.json');
  if (!fs.existsSync(tokenPath)) {
    throw new Error('No se han encontrado credenciales de Google. Por favor ejecuta "npm run authorize" primero.');
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/callback'
  );

  oauth2Client.setCredentials(tokens);

  // Auto-refresh hook: Save refreshed tokens back to tokens.json
  oauth2Client.on('tokens', (newTokens) => {
    const mergedTokens = { ...tokens, ...newTokens };
    fs.writeFileSync(tokenPath, JSON.stringify(mergedTokens, null, 2));
    console.log('🔄 Tokens de Google refrescados y guardados en tokens.json.');
  });

  return oauth2Client;
}

/**
 * Downloads a file from Google Drive by its fileId to a destination path.
 */
export async function downloadFileFromDrive(auth, fileId, destPath) {
  const drive = google.drive({ version: 'v3', auth });
  const dest = fs.createWriteStream(destPath);

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    response.data
      .on('end', () => {
        resolve(destPath);
      })
      .on('error', (err) => {
        reject(err);
      })
      .pipe(dest);
  });
}

/**
 * Gets or creates a subfolder inside a parent folder in Google Drive.
 */
async function getOrCreateSubFolder(drive, parentFolderId, folderName) {
  const response = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentFolderId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId]
  };

  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: 'id'
  });

  return folder.data.id;
}

/**
 * Moves a file in Google Drive to an "Archived" folder inside the file's current folder.
 */
export async function archiveDriveFile(auth, fileId) {
  const drive = google.drive({ version: 'v3', auth });

  // 1. Get the current parent folder of the file
  const file = await drive.files.get({
    fileId: fileId,
    fields: 'parents, name'
  });

  const parentFolderId = file.data.parents && file.data.parents[0];
  if (!parentFolderId) {
    console.warn(`El archivo ${file.data.name} no tiene carpeta contenedora, no se archivará.`);
    return;
  }

  // 2. Get or create the "Archived" folder inside the parent folder
  const archiveFolderId = await getOrCreateSubFolder(drive, parentFolderId, 'Archived');

  // 3. Move the file
  const previousParents = file.data.parents.join(',');
  await drive.files.update({
    fileId: fileId,
    addParents: archiveFolderId,
    removeParents: previousParents,
    fields: 'id, parents'
  });

  console.log(`📂 Archivo "${file.data.name}" movido a la carpeta "Archived" en Google Drive.`);
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
  const response = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

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
    downloadUrl: `https://docs.google.com/uc?export=download&id=${fileId}`
  };
}

/**
 * Formats and writes information to a new Google Doc.
 */
export async function createGoogleDocFromChat(auth, { docTitle, infoItems, tasksCreated, imagesUploaded }) {
  const docs = google.docs({ version: 'v1', auth });

  const doc = await docs.documents.create({
    requestBody: { title: docTitle }
  });
  const documentId = doc.data.documentId;

  const requests = [];
  let currentIndex = 1;

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

  appendText(`${docTitle}\n`, 'TITLE');
  appendText(`Documento generado automáticamente en Modo Agente (Apps Script)\n`, 'SUBTITLE');
  appendText(`Fecha de procesamiento: ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES')}\n\n`, 'NORMAL_TEXT');

  if (infoItems && infoItems.length > 0) {
    appendText(`Información Relevante Compartida\n`, 'HEADING_1');
    appendText(`Esta sección resume los datos útiles, enlaces y notas técnicas compartidas en el grupo.\n\n`, 'NORMAL_TEXT');

    for (const item of infoItems) {
      appendText(`${item.topic}\n`, 'HEADING_2');
      appendText(`${item.summary}\n\n`, 'NORMAL_TEXT');

      if (item.relatedAttachments && item.relatedAttachments.length > 0) {
        for (const attachmentName of item.relatedAttachments) {
          const uploadedImage = imagesUploaded.find(img => img.originalName === attachmentName);
          if (uploadedImage && uploadedImage.isImage) {
            requests.push({
              insertInlineImage: {
                uri: uploadedImage.downloadUrl,
                location: { index: currentIndex },
                objectSize: {
                  width: { magnitude: 450, unit: 'PT' }
                }
              }
            });
            currentIndex += 1;
            appendText(`\n[Imagen: ${attachmentName} - Detalle: ${uploadedImage.description || 'Sin descripción'}]\n\n`, 'NORMAL_TEXT');
          } else {
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
        const indentedDesc = task.description.split('\n').map(line => `  ${line}`).join('\n');
        appendText(`  Contexto:\n${indentedDesc}\n`, 'NORMAL_TEXT');
      }
      appendText(`\n`, 'NORMAL_TEXT');
    }
  }

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
