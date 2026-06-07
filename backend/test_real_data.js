import { extractAndParseZip, cleanTempDir } from './services/parser.js';
import { groupMessagesIntoThreads } from './services/gemini.js';
import path from 'path';

const zipPath = path.resolve('../Chat de WhatsApp con Hotel Villa de Ermua (Ultimo Mes).zip');

try {
  console.log('--- Diagnóstico de Carga Real ---');
  console.log(`Cargando: ${zipPath}`);
  
  const result = extractAndParseZip(zipPath);
  console.log('✅ Descompresión exitosa.');
  console.log(`Total mensajes parseados: ${result.messages.length}`);
  
  if (result.messages.length > 0) {
    console.log('\nPrimeros 5 mensajes parseados:');
    result.messages.slice(0, 5).forEach((msg, i) => {
      console.log(`[${i+1}] Date: "${msg.date}" | Time: "${msg.time}" | Sender: "${msg.sender}" | Text: "${msg.text.substring(0, 60)}..."`);
    });
    
    console.log('\nÚltimos 5 mensajes parseados:');
    result.messages.slice(-5).forEach((msg, i) => {
      console.log(`[${result.messages.length - 4 + i}] Date: "${msg.date}" | Time: "${msg.time}" | Sender: "${msg.sender}" | Text: "${msg.text.substring(0, 60)}..."`);
    });

    const threads = groupMessagesIntoThreads(result.messages);
    console.log(`\nTotal hilos agrupados: ${threads.length}`);
    if (threads.length > 0) {
      console.log(`Tamaño del primer hilo: ${threads[0].length} mensajes.`);
      console.log(`Tamaño del último hilo: ${threads[threads.length - 1].length} mensajes.`);
    }
  } else {
    console.log('❌ ¡ADVERTENCIA! Se parsearon 0 mensajes. Algo falló en la expresión regular o lectura.');
  }

  cleanTempDir(result.tempDir);
} catch (error) {
  console.error('Error durante el diagnóstico:', error);
}
