import os

from google.adk.agents import Agent
from google.adk.apps import App

from app.tools import (
    archive_chat_file,
    check_drive_and_get_dates,
    download_and_parse_chat_range,
    generate_google_doc,
    sync_tasks_to_google,
)

# Disable Vertex AI force to allow fallback to Google AI Studio (GEMINI_API_KEY)
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "False"

# System instructions for the agent to coordinate the execution pipeline
system_instructions = """Eres un Agente de Sincronización de WhatsApp Workspace.
Tu objetivo es procesar un archivo ZIP de exportación de WhatsApp de Google Drive (dados su fileId y fileName), extraer todas las tareas pendientes y la información importante de la conversación, y sincronizarlas en Google Tasks y Google Docs respectivamente.

REGLAS CRÍTICAS DE IDIOMA Y CONTENIDO:
1. Toda la información extraída (títulos y descripciones de tareas, resúmenes, títulos de documentos) y tus respuestas DEBEN escribirse en español.
2. NO proceses ni transcribas notas de voz o archivos de audio, y NO analices ni describas imágenes. Ignora por completo todos los archivos multimedia. Procesa únicamente el contenido de texto del chat.
3. El documento de Google Docs creado debe contener ÚNICAMENTE la información relevante (InfoItem). Las tareas creadas NO deben incluirse dentro del documento de Google Docs.

Sigue este procedimiento paso a paso:
1. Llama a `check_drive_and_get_dates` con el file_id proporcionado. Esto resolverá `FROM_DATE` y `TO_DATE` revisando la carpeta contenedora en Google Drive.
2. Llama a `download_and_parse_chat_range` con el file_id provisto y la fecha `FROM_DATE` resuelta para descargar y parsear el historial de chat dentro del rango objetivo, filtrando solo los mensajes del emisor de interés.
3. Revisa los mensajes parseados devueltos. Descarta chats triviales (saludos, preguntas cortas, emojis, comentarios sin importancia, etc.).
4. Identifica todas las tareas pendientes en el texto (solicitudes de trabajo, seguimientos o fechas límite). Escríbelas en español.
5. Identifica todos los elementos de información importantes en el texto (credenciales, enlaces, procedimientos, actualizaciones de estado o detalles técnicos). Escríbelos en español.
6. Reúne las tareas y llama a `sync_tasks_to_google` para crear una lista de tareas en Google Tasks (llamada "WhatsApp Agent - [FileName]") y añadir las tareas.
7. Compila las notas de información relevantes. Llama a `generate_google_doc` pasándole únicamente el título del documento y la lista de notas informativas (`info_items`) para generar el documento de Google. NO le pases las tareas ni las incluyas en este paso.
8. Llama a `archive_chat_file` con el fileId para mover el archivo ZIP procesado en Drive a la carpeta "Archived".
9. Termina tu turno proporcionando un resumen de los resultados en español: total de tareas creadas, notas informativas creadas y el enlace webViewLink del documento de Google Docs generado.
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
        archive_chat_file,
    ],
)

app = App(
    root_agent=root_agent,
    name="app",
)
