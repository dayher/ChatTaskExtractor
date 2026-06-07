import { GoogleGenAI } from '@google/genai';

/**
 * Groups WhatsApp messages into logical conversation threads.
 * A new thread is started if:
 * 1. The time difference between consecutive messages is > 12 hours.
 * 2. The thread message count exceeds 200 messages (to keep context optimal).
 */
export function groupMessagesIntoThreads(messages) {
  if (!messages || messages.length === 0) return [];

  const threads = [];
  let currentThread = [];

  const parseDateTime = (msg) => {
    try {
      // Normalize date: replace / or - with -
      const cleanDate = msg.date.replace(/[\/\.]/g, '-');
      // Splitting date to guess format
      const parts = cleanDate.split('-');
      let day, month, year;
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        [year, month, day] = parts;
      } else {
        // DD-MM-YY or MM-DD-YY or DD-MM-YYYY
        [day, month, year] = parts;
        if (year.length === 2) {
          year = '20' + year; // Assumes 21st century
        }
      }

      // Parse time
      let timeStr = msg.time;
      let hours = 0, minutes = 0, seconds = 0;
      const is12Hour = /am|pm/i.test(timeStr);

      if (is12Hour) {
        const match = timeStr.match(/(\d+):(\d+)(?::(\d+))?\s*(am|pm)/i);
        if (match) {
          hours = parseInt(match[1]);
          minutes = parseInt(match[2]);
          seconds = match[3] ? parseInt(match[3]) : 0;
          const meridian = match[4].toLowerCase();
          if (meridian === 'pm' && hours < 12) hours += 12;
          if (meridian === 'am' && hours === 12) hours = 0;
        }
      } else {
        const match = timeStr.match(/(\d+):(\d+)(?::(\d+))?/);
        if (match) {
          hours = parseInt(match[1]);
          minutes = parseInt(match[2]);
          seconds = match[3] ? parseInt(match[3]) : 0;
        }
      }

      return new Date(year, month - 1, day, hours, minutes, seconds);
    } catch (e) {
      return null;
    }
  };

  let lastDate = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const currentDate = parseDateTime(msg);
    let startNewThread = false;

    if (currentThread.length === 0) {
      startNewThread = false;
    } else if (currentThread.length >= 200) {
      startNewThread = true;
    } else if (lastDate && currentDate) {
      const diffMs = currentDate - lastDate;
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours > 12) {
        startNewThread = true;
      }
    } else {
      // Fallback: If date parsing failed but dates as strings changed, or count is high
      if (currentThread.length > 0 && messages[i - 1].date !== msg.date) {
        startNewThread = true; // start new thread on day change if parsing fails
      }
    }

    if (startNewThread) {
      threads.push(currentThread);
      currentThread = [];
    }

    currentThread.push(msg);
    if (currentDate) {
      lastDate = currentDate;
    }
  }

  if (currentThread.length > 0) {
    threads.push(currentThread);
  }

  return threads;
}

/**
 * Uses Gemini to classify a chat thread and extract tasks and informational content.
 * Discards trivial conversations if they don't contain value.
 * Includes automatic retry with exponential backoff on 429 rate limit errors.
 */
export async function analyzeChatThread(messages, apiKey, onWarning = null) {
  if (!apiKey) {
    throw new Error('API Key de Gemini no proporcionada.');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Format messages for the prompt
  const formattedMessages = messages
    .map(m => `[${m.date} ${m.time}] ${m.sender}: ${m.text} ${m.attachment ? `(Archivo adjunto: ${m.attachment})` : ''}`)
    .join('\n');

  const prompt = `Analiza la siguiente conversación de un grupo de WhatsApp de trabajo. 
Clasifica el contenido y extrae:
1. Tareas accionables (pendientes, solicitudes de trabajo, compromisos de entrega).
2. Información importante o compartida relevante (procedimientos, credenciales, enlaces, detalles técnicos, resúmenes de reuniones, avisos).
3. Determina si toda la conversación en este bloque es trivial (saludos, chistes, conversaciones no laborales, emojis) y debe descartarse.

Conversación:
\"\"\"
${formattedMessages}
\"\"\"`;

  let delay = 3000;
  const retries = 3;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              isTrivial: {
                type: 'BOOLEAN',
                description: 'True si el bloque de conversación es solo charla trivial (saludos, emojis, bromas, plática informal) y no tiene tareas ni información importante.'
              },
              tasks: {
                type: 'ARRAY',
                description: 'Lista de tareas accionables extraídas.',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING', description: 'Título claro y conciso de la tarea' },
                    description: { type: 'STRING', description: 'Detalle de la tarea. Incluye quién la solicitó, a quién se asignó si se menciona, y el contexto de la conversación.' },
                    assignee: { type: 'STRING', description: 'Persona asignada a la tarea (si se menciona, si no, dejar vacío)' },
                    inferredDueDate: { type: 'STRING', description: 'Fecha de vencimiento inferida o mencionada (en formato YYYY-MM-DD), o vacío' }
                  },
                  required: ['title', 'description']
                }
              },
              information: {
                type: 'ARRAY',
                description: 'Información relevante que debe ser registrada para consulta futura.',
                items: {
                  type: 'OBJECT',
                  properties: {
                    topic: { type: 'STRING', description: 'Tema o título corto de la información' },
                    summary: { type: 'STRING', description: 'Resumen o contenido detallado de la información compartida' },
                    relatedAttachments: {
                      type: 'ARRAY',
                      description: 'Archivos adjuntos que se mencionan en esta información',
                      items: { type: 'STRING' }
                    }
                  },
                  required: ['topic', 'summary']
                }
              }
            },
            required: ['isTrivial', 'tasks', 'information']
          }
        }
      });

      const text = response.text;
      return JSON.parse(text);
    } catch (error) {
      const isRateLimit = error.status === 429 || 
                          (error.message && (error.message.includes('429') || 
                                             error.message.includes('quota') || 
                                             error.message.includes('exhausted') || 
                                             error.message.includes('Rate limit')));
      
      if (isRateLimit && attempt < retries) {
        console.warn(`Límite de velocidad de Gemini alcanzado. Reintentando en ${delay / 1000}s... (Intento ${attempt}/${retries})`);
        if (onWarning) {
          onWarning(`Límite de velocidad alcanzado. Esperando ${delay / 1000}s para reintentar... (Intento ${attempt}/${retries})`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
        continue;
      }
      
      console.error(`Error al analizar hilo con Gemini (Intento ${attempt}/${retries}):`, error);
      if (attempt === retries) {
        if (onWarning) {
          onWarning(`Error al analizar bloque de chat: ${error.message}. Se omitirá este bloque.`);
        }
        return {
          isTrivial: false,
          tasks: [],
          information: []
        };
      }
    }
  }
}

/**
 * Transcribes audio file bytes using Gemini's multimodal audio capabilities.
 */
export async function transcribeAudio(audioBuffer, mimeType, apiKey) {
  if (!apiKey) {
    throw new Error('API Key de Gemini no proporcionada.');
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: audioBuffer.toString('base64'),
            mimeType: mimeType
          }
        },
        'Transcribe el siguiente audio de WhatsApp. Si el audio contiene indicaciones de tareas o información, transcribe el contenido completo de la forma más exacta posible. No agregues introducciones ni explicaciones adicionales, solo el texto transcrito.'
      ]
    });

    return response.text ? response.text.trim() : 'Transcripción no disponible.';
  } catch (error) {
    console.error('Error al transcribir audio con Gemini:', error);
    return `Error en transcripción de audio (${error.message})`;
  }
}

/**
 * Analyzes and describes image contents using Gemini.
 */
export async function describeImage(imageBuffer, mimeType, apiKey) {
  if (!apiKey) {
    throw new Error('API Key de Gemini no proporcionada.');
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: mimeType
          }
        },
        'Describe con detalle qué se muestra en esta imagen compartida en un grupo de chat de trabajo (si es una captura de pantalla, describe el texto y lo que representa; si es una foto, resume su contenido relevante para el equipo).'
      ]
    });

    return response.text ? response.text.trim() : 'Descripción no disponible.';
  } catch (error) {
    console.error('Error al describir imagen con Gemini:', error);
    return `Error en análisis de imagen (${error.message})`;
  }
}
