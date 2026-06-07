import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

/**
 * Parses the WhatsApp chat text file.
 * Handles multi-line messages and detects media attachments.
 */
export function parseChatText(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const messages = [];

  // Regex for iOS: [dd/mm/yy, hh:mm:ss] Author: Message
  // Example: [06/07/26 10:15:30] Dayher: Hola
  // Also supports [d/m/yy, h:mm:ss] or [dd-mm-yyyy hh:mm:ss]
  const iosRegex = /^\[(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[aApP][mM])?)\]\s+([^:]+):\s+(.*)$/;

  // Regex for Android: dd/mm/yy, hh:mm - Author: Message
  // Example: 06/07/26, 10:15 - Dayher: Hola
  const androidRegex = /^(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[aApP][mM])?)\s+-\s+([^:]+):\s+(.*)$/;

  // Regex to detect attachment references in messages
  const attachmentRegexes = [
    /<archivo adjunto:\s*([^>]+)>/i,
    /<attached:\s*([^>]+)>/i,
    /([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|opus|wav|mp3|m4a|ogg|pdf|docx|xlsx))\s*\(archivo adjunto\)/i,
    /([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|opus|wav|mp3|m4a|ogg|pdf|docx|xlsx))\s*\(file attached\)/i,
    // Android media attachment message placeholder (e.g. "Dayher: image.jpg (archivo adjunto)")
    // or just "Dayher: image.jpg <y nada más>"
    /^[a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|opus|wav|mp3|m4a|ogg)\s*$/i
  ];

  let currentMsg = null;

  for (let line of lines) {
    if (!line.trim()) continue;

    let match = line.match(iosRegex);
    let isNewMessage = false;
    let dateStr, timeStr, sender, body;

    if (match) {
      isNewMessage = true;
      [, dateStr, timeStr, sender, body] = match;
    } else {
      match = line.match(androidRegex);
      if (match) {
        isNewMessage = true;
        [, dateStr, timeStr, sender, body] = match;
      }
    }

    if (isNewMessage) {
      // Save the previous message if it exists
      if (currentMsg) {
        messages.push(currentMsg);
      }

      // Detect if the message body represents an attachment
      let attachment = null;
      for (const regex of attachmentRegexes) {
        const attachMatch = body.match(regex);
        if (attachMatch) {
          // The first capture group is the filename, unless it's the full string match (regex 4)
          attachment = attachMatch[1] ? attachMatch[1].trim() : body.trim();
          break;
        }
      }

      currentMsg = {
        date: dateStr,
        time: timeStr,
        sender: sender.trim(),
        text: body.trim(),
        attachment: attachment
      };
    } else {
      // Continuation of the previous message
      if (currentMsg) {
        currentMsg.text += '\n' + line.trim();
        // Check if the continuation line itself has attachment info (rare but possible)
        for (const regex of attachmentRegexes) {
          const attachMatch = line.match(regex);
          if (attachMatch) {
            currentMsg.attachment = attachMatch[1] ? attachMatch[1].trim() : line.trim();
            break;
          }
        }
      }
    }
  }

  // Push the last message
  if (currentMsg) {
    messages.push(currentMsg);
  }

  return messages;
}

/**
 * Extracts a WhatsApp ZIP file to a temporary directory and parses the chat text.
 * @param {string} zipPath - Path to the uploaded zip file.
 * @param {string} baseTempDir - Root temp directory.
 * @returns {object} { messages, mediaDir, tempDir }
 */
export function extractAndParseZip(zipPath, baseTempDir = '/tmp/whatsapp-extractor') {
  const zipName = path.basename(zipPath, '.zip');
  const tempDir = path.join(baseTempDir, `${zipName}_${Date.now()}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  // Find the chat text file
  const files = fs.readdirSync(tempDir);
  // Look for _chat.txt or any .txt file
  let chatFile = files.find(f => f.toLowerCase() === '_chat.txt');
  if (!chatFile) {
    chatFile = files.find(f => f.toLowerCase().endsWith('.txt') && !f.startsWith('.'));
  }

  if (!chatFile) {
    throw new Error('No se encontró ningún archivo de conversación (.txt) en el zip.');
  }

  const chatFilePath = path.join(tempDir, chatFile);
  const messages = parseChatText(chatFilePath);

  return {
    messages,
    mediaDir: tempDir, // The media files are extracted in the root of the tempDir
    tempDir
  };
}

/**
 * Cleans up a temporary directory
 * @param {string} tempDir 
 */
export function cleanTempDir(tempDir) {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
