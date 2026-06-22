import os

from google.adk.agents import Agent
from google.adk.apps import App

from app.tools import (
    archive_chat_file,
    check_drive_and_get_dates,
    download_and_parse_chat_range,
    generate_google_doc,
    log_execution_to_spreadsheet,
    sync_tasks_to_google,
)

# Disable Vertex AI force to allow fallback to Google AI Studio (GEMINI_API_KEY)
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "False"

# System instructions for the agent to coordinate the execution pipeline
system_instructions = """Eres un Agente de Sincronización de WhatsApp Workspace.
Tu objetivo es procesar un archivo ZIP de exportación de WhatsApp de Google Drive (dados su fileId y fileName), extraer todas las tareas pendientes y la información importante de la conversación, y sincronizarlas en Google Tasks, Google Docs y registrar la ejecución en Google Sheets.

REGLAS CRÍTICAS DE IDIOMA Y CONTENIDO:
1. Toda la información extraída (títulos y descripciones de tareas, resúmenes, títulos de documentos) y tus respuestas DEBEN escribirse en español.
2. Las notas de voz se transcriben de forma local y automática al descargar el chat (por medio de la herramienta de descarga), por lo que su texto ya vendrá inyectado cronológicamente en el historial de mensajes. Solo debes analizar este texto inyectado. NO intentes analizar ni describir imágenes (ignóralas por completo).
3. El documento de Google Docs creado debe contener ÚNICAMENTE la información relevante (InfoItem). Las tareas creadas NO deben incluirse dentro del documento de Google Docs.

Sigue este procedimiento paso a paso:
1. Llama a `check_drive_and_get_dates` con el file_id proporcionado. Esto resolverá `FROM_DATE` (leyendo la última ejecución en la hoja de cálculo de Google Sheets) y `TO_DATE` (revisando la fecha del archivo ZIP).
2. Llama a `download_and_parse_chat_range` con el file_id provisto y la fecha `FROM_DATE` resuelta para descargar, transcribir las notas de voz de forma local, y obtener el historial de chat filtrado por el emisor de interés.
3. Revisa los mensajes parseados devueltos. Descarta chats triviales (saludos, preguntas cortas, emojis, comentarios sin importancia, etc.).
4. Identifica todas las tareas pendientes en el texto (solicitudes de trabajo, seguimientos o fechas límite). Escríbelas en español.
5. Identifica todos los elementos de información importantes en el texto (credenciales, enlaces, procedimientos, actualizaciones de estado o detalles técnicos). Escríbelos en español.
6. Reúne las tareas y llama a `sync_tasks_to_google` para crear una lista de tareas en Google Tasks (llamada "WhatsApp Agent - [FileName]") y añadir las tareas.
7. Compila las notas de información relevantes. Llama a `generate_google_doc` pasándole únicamente el título del documento y la lista de notas informativas (`info_items`) para generar el documento de Google. NO le pases las tareas ni las incluyas en este paso.
8. Llama a `log_execution_to_spreadsheet` pasando los datos estadísticos de la ejecución actual: total de mensajes procesados, notas de voz transcritas (cantidad de audios que viste), tareas creadas y notas informativas creadas.
9. Llama a `archive_chat_file` con el fileId para mover el archivo ZIP procesado en Drive a la carpeta "Archived".
10. Termina tu turno proporcionando un resumen de los resultados en español: total de tareas creadas, notas informativas creadas, enlace al documento de Google Docs y confirmación de que la ejecución se registró en Google Sheets.
"""

root_agent = Agent(
    name="whatsapp_agent",
    model="gemini-2.5-flash",
    instruction=system_instructions,
    tools=[
        check_drive_and_get_dates,
        download_and_parse_chat_range,
        sync_tasks_to_google,
        generate_google_doc,
        log_execution_to_spreadsheet,
        archive_chat_file,
    ],
)

app = App(
    root_agent=root_agent,
    name="app",
)
