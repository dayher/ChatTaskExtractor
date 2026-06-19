/**
 * ============================================================================
 * SCRIPT DE GOOGLE APPS SCRIPT PARA ACTIVACIÓN DEL AGENTE DE WHATSAPP
 * ============================================================================
 * 
 * Instrucciones de instalación:
 * 1. Abre Google Drive y crea una carpeta de entrada (ej. "WhatsApp_Agent_Landing").
 * 2. Copia el ID de la carpeta desde la URL de la misma (ej. la parte final tras ".../folders/ID_DE_LA_CARPETA").
 * 3. Ve a https://script.google.com/ e inicia un "Nuevo proyecto".
 * 4. Pega este código completo en el editor de Apps Script (reemplazando el código por defecto).
 * 5. Modifica las variables de configuración FOLDER_ID y WEBHOOK_URL.
 * 6. Guarda el proyecto (Cmd+S / Ctrl+S).
 * 7. Ve al menú de la izquierda "Activadores" (icono de reloj) -> "Añadir activador":
 *    - Selecciona qué función ejecutar: "processWhatsAppFolder"
 *    - Selecciona el origen del evento: "Según tiempo"
 *    - Selecciona el tipo de activador basado en el tiempo: "Temporizador de horas"
 *    - Selecciona el intervalo de horas: "Cada 6 horas" (o el periodo que prefieras)
 *    - Guarda y concede permisos de Google Drive al script.
 */

// CONFIGURACIÓN DE TU AGENTE PERSONAL
var FOLDER_ID = "INTRODUCE_AQUI_EL_ID_DE_TU_CARPETA_DE_DRIVE";
var WEBHOOK_URL = "https://TU_URL_PUBLICA_O_NGROK.ngrok-free.app/api/agent-trigger";

function processWhatsAppFolder() {
  Logger.log("🔎 Buscando archivos ZIP de WhatsApp en la carpeta de Drive...");

  try {
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var files = folder.getFiles();
    var zipCount = 0;

    while (files.hasNext()) {
      var file = files.next();
      var fileName = file.getName();
      
      // Procesa solo archivos con extensión .zip
      if (fileName.toLowerCase().endsWith('.zip')) {
        zipCount++;
        Logger.log("📦 Encontrado archivo ZIP: '" + fileName + "' (ID: " + file.getId() + ")");
        Logger.log("📡 Enviando webhook al Agente de WhatsApp...");

        var payload = {
          fileId: file.getId(),
          fileName: fileName
        };

        var options = {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };

        var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
        var responseCode = response.getResponseCode();
        var responseText = response.getContentText();

        Logger.log("📡 Respuesta recibida del Agente (Código HTTP: " + responseCode + ")");
        
        if (responseCode === 200) {
          try {
            var result = JSON.parse(responseText);
            if (result.success) {
              Logger.log("✅ ¡Procesamiento Exitoso por el Agente!");
              Logger.log("📝 Documento generado: " + result.docLink);
              Logger.log("📋 Tareas creadas: " + result.tasksCreated);
              // Nota: El backend de Python ADK se encarga automáticamente de mover el archivo
              // procesado a la carpeta "Archived" dentro de Drive.
            } else {
              Logger.log("❌ Error reportado por el Agente: " + result.error);
            }
          } catch(e) {
            Logger.log("⚠️ No se pudo parsear la respuesta JSON: " + responseText);
          }
        } else {
          Logger.log("❌ Error en el servidor webhook (HTTP " + responseCode + "): " + responseText);
        }
      }
    }

    if (zipCount === 0) {
      Logger.log("📭 No se encontraron nuevos archivos ZIP en este intervalo.");
    }

  } catch (error) {
    Logger.log("❌ Error crítico en la ejecución de Apps Script: " + error.toString());
  }
}
