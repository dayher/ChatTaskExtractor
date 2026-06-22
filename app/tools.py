import io
import os
import re
import zipfile
from datetime import date, datetime, timedelta

from google import genai
from google.adk.tools import ToolContext
from google.genai import types
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from pydantic import BaseModel, Field

from app.auth import get_google_credentials


# Pydantic models for Google GenAI tool schema validation
class TaskItem(BaseModel):
    title: str = Field(description="Título de la tarea")
    description: str = Field(
        default="", description="Descripción o contexto de la tarea"
    )
    inferredDueDate: str = Field(
        default="",
        description="Fecha límite en formato YYYY-MM-DD si se menciona en el chat",
    )


class InfoItem(BaseModel):
    topic: str = Field(description="Tema principal de la información")
    summary: str = Field(description="Resumen de la información compartida")
    relatedAttachments: list[str] = Field(
        default=[],
        description="Lista de nombres de archivos adjuntos relacionados (ej. foto.png, audio.opus)",
    )


class MediaItem(BaseModel):
    originalName: str = Field(description="Nombre original del archivo adjunto")
    description: str = Field(
        default="",
        description="Descripción del contenido de la imagen (vacío para audios)",
    )
    transcript: str = Field(
        default="", description="Transcripción de la nota de voz (vacío para imágenes)"
    )
    isImage: bool = Field(default=False, description="True si es una imagen")
    isAudio: bool = Field(
        default=False, description="True si es una nota de voz de audio"
    )


# Helper to map WhatsApp mime types
def get_mime_type(filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    elif ext == ".png":
        return "image/png"
    elif ext == ".webp":
        return "image/webp"
    elif ext == ".gif":
        return "image/gif"
    elif ext == ".opus":
        return "audio/ogg"
    elif ext == ".wav":
        return "audio/wav"
    elif ext == ".mp3":
        return "audio/mpeg"
    elif ext == ".m4a":
        return "audio/mp4"
    elif ext == ".ogg":
        return "audio/ogg"
    else:
        return "application/octet-stream"


def parse_whatsapp_date(date_str: str) -> date:
    """
    Converts a date string from WhatsApp log into a datetime.date object.
    Handles dd/mm/yy, dd/mm/yyyy, and variations with dashes or dots.
    """
    clean_str = date_str.replace("-", "/").replace(".", "/")
    parts = clean_str.split("/")
    if len(parts) != 3:
        return None
    try:
        day = int(parts[0])
        month = int(parts[1])
        year = int(parts[2])
        if year < 100:
            year += 2000
        return date(year, month, day)
    except Exception:
        return None


def parse_chat_text_reverse(
    content: str, from_date: date, sender_of_interest: str
) -> list:
    """
    Parses WhatsApp exported txt log from bottom to top (newest to oldest).
    Stops parsing when it encounters a message with a date older than from_date.
    Filters messages by sender_of_interest.
    """
    lines = content.splitlines()
    messages = []

    # iOS Regex: ^\[(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[aApP][mM])?)\]\s+([^:]+):\s+(.*)$
    ios_pattern = re.compile(
        r"^\[(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[aApP][mM])?)\]\s+([^:]+):\s+(.*)$"
    )

    # Android Regex: ^(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[aApP][mM])?)\s+-\s+([^:]+):\s+(.*)$
    android_pattern = re.compile(
        r"^(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[aApP][mM])?)\s+-\s+([^:]+):\s+(.*)$"
    )

    attachment_patterns = [
        re.compile(r"<archivo adjunto:\s*([^>]+)>", re.IGNORECASE),
        re.compile(r"<attached:\s*([^>]+)>", re.IGNORECASE),
        re.compile(
            r"([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|opus|wav|mp3|m4a|ogg|pdf|docx|xlsx))\s*\(archivo adjunto\)",
            re.IGNORECASE,
        ),
        re.compile(
            r"([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|opus|wav|mp3|m4a|ogg|pdf|docx|xlsx))\s*\(file attached\)",
            re.IGNORECASE,
        ),
        re.compile(
            r"^[a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|opus|wav|mp3|m4a|ogg)\s*$",
            re.IGNORECASE,
        ),
    ]

    current_msg_lines = []

    for line in reversed(lines):
        if not line.strip():
            continue

        match = ios_pattern.match(line)
        is_start = False
        if match:
            is_start = True
            date_str, time_str, sender, body = match.groups()
        else:
            match = android_pattern.match(line)
            if match:
                is_start = True
                date_str, time_str, sender, body = match.groups()

        if is_start:
            msg_date = parse_whatsapp_date(date_str)
            if msg_date and msg_date < from_date:
                # Stop reading immediately as we crossed the chronological boundary
                break

            full_body = body.strip()
            if current_msg_lines:
                full_body += "\n" + "\n".join(reversed(current_msg_lines))
                current_msg_lines = []

            if sender.strip().lower() == sender_of_interest.lower():
                attachment = None
                for p in attachment_patterns:
                    att_match = p.search(full_body)
                    if att_match:
                        attachment = (
                            att_match.group(1).strip()
                            if len(att_match.groups()) > 0
                            else full_body.strip()
                        )
                        break

                messages.append(
                    {
                        "date": date_str,
                        "time": time_str,
                        "sender": sender.strip(),
                        "text": full_body,
                        "attachment": attachment,
                    }
                )
        else:
            current_msg_lines.append(line.strip())

    return list(reversed(messages))


# --- ADK Tool Definitions ---


def check_drive_and_get_dates(file_id: str, tool_context: ToolContext) -> dict:
    """
    Checks Google Drive parent folder and its 'Archived' subfolder to find ZIP exports.
    Retrieves the last execution date from Google Sheets to define FROM_DATE.
    If no sheet exists, falls back to sorting ZIP exports by modification date.

    Args:
        file_id: The ID of the ZIP file currently being processed.

    Returns:
        A dictionary containing the resolved from_date and to_date strings (YYYY-MM-DD format).
    """
    print(f"📡 check_drive_and_get_dates invocado para ID: {file_id}")
    creds = get_google_credentials()
    drive_service = build("drive", "v3", credentials=creds)

    try:
        file_metadata = (
            drive_service.files()
            .get(fileId=file_id, fields="parents, name, modifiedTime")
            .execute()
        )
    except Exception as e:
        print(f"❌ Error al consultar Drive para el archivo {file_id}: {e}")
        to_dt = datetime.now()
        from_dt = to_dt - timedelta(days=30)
        return {
            "from_date": from_dt.strftime("%Y-%m-%d"),
            "to_date": to_dt.strftime("%Y-%m-%d"),
            "total_zips_found": 0,
        }

    parents = file_metadata.get("parents") or []
    if not parents:
        to_dt = datetime.now()
        from_dt = to_dt - timedelta(days=30)
        return {
            "from_date": from_dt.strftime("%Y-%m-%d"),
            "to_date": to_dt.strftime("%Y-%m-%d"),
            "total_zips_found": 0,
        }

    parent_id = parents[0]

    # Resolve TO_DATE from current ZIP modification date
    to_dt_str = file_metadata.get("modifiedTime", "").split(".")[0].replace("Z", "")
    to_date = datetime.strptime(to_dt_str, "%Y-%m-%dT%H:%M:%S")

    # List ZIP files in parent folder and Archived folder to count them / use as fallback
    zip_files = []
    try:
        q_parent = (
            f"mimeType='application/zip' and '{parent_id}' in parents and trashed=false"
        )
        results_parent = (
            drive_service.files()
            .list(q=q_parent, fields="files(id, name, modifiedTime)")
            .execute()
        )
        zip_files.extend(results_parent.get("files", []))

        # Check 'Archived' subfolder
        q_archive_dir = f"mimeType='application/vnd.google-apps.folder' and name='Archived' and '{parent_id}' in parents and trashed=false"
        results_archive_dir = (
            drive_service.files().list(q=q_archive_dir, fields="files(id)").execute()
        )
        archive_folders = results_archive_dir.get("files", [])

        if archive_folders:
            archive_folder_id = archive_folders[0]["id"]
            q_archive = f"mimeType='application/zip' and '{archive_folder_id}' in parents and trashed=false"
            results_archive = (
                drive_service.files()
                .list(q=q_archive, fields="files(id, name, modifiedTime)")
                .execute()
            )
            zip_files.extend(results_archive.get("files", []))
    except Exception as e:
        print(f"⚠️ Error al listar archivos ZIP de fallback: {e}")

    # De-duplicate ZIP files
    unique_zips = {}
    for z in zip_files:
        unique_zips[z["id"]] = z
    zip_files = list(unique_zips.values())

    for z in zip_files:
        dt = datetime.strptime(
            z["modifiedTime"].split(".")[0].replace("Z", ""), "%Y-%m-%dT%H:%M:%S"
        )
        z["parsed_time"] = dt

    zip_files.sort(key=lambda x: x["parsed_time"])

    # 1. Search in Google Sheets for the last execution date
    from_date = None
    try:
        sheet_query = (
            f"name='WhatsApp Agent - Registro de Ejecuciones' and "
            f"mimeType='application/vnd.google-apps.spreadsheet' and "
            f"'{parent_id}' in parents and trashed=false"
        )
        sheet_results = (
            drive_service.files().list(q=sheet_query, fields="files(id)").execute()
        )
        sheet_files = sheet_results.get("files", [])

        if sheet_files:
            sheet_id = sheet_files[0]["id"]
            print(f"📊 Encontrada hoja de cálculo de registro: {sheet_id}")
            sheets_service = build("sheets", "v4", credentials=creds)
            # Leer columna C: "Hasta Fecha"
            result = (
                sheets_service.spreadsheets()
                .values()
                .get(spreadsheetId=sheet_id, range="Sheet1!C:C")
                .execute()
            )
            values = result.get("values", [])
            if len(values) > 1:
                # Obtener el valor de la última fila (excluyendo cabecera)
                last_hasta_fecha_str = values[-1][0].strip()
                from_date = datetime.strptime(last_hasta_fecha_str, "%Y-%m-%d")
                print(
                    f"📅 Fecha FROM_DATE recuperada del registro: {last_hasta_fecha_str}"
                )
        else:
            print("📊 No se encontró hoja de cálculo de registro en Drive.")
    except Exception as e:
        print(f"⚠️ Error al consultar el registro en Google Sheets: {e}")

    # 2. Fallback to modified times of ZIP files if no sheet or no date found
    if from_date is None:
        print(
            "[Info] Usando lógica de fallback basada en fechas de modificación de los archivos ZIP..."
        )
        if len(zip_files) >= 2:
            current_index = next(
                (i for i, z in enumerate(zip_files) if z["id"] == file_id),
                len(zip_files) - 1,
            )
            if current_index > 0:
                prev_zip = zip_files[current_index - 1]
                from_date = prev_zip["parsed_time"]
            else:
                from_date = zip_files[current_index]["parsed_time"] - timedelta(days=30)
        else:
            from_date = to_date - timedelta(days=30)

    # Save resolved dates in session state
    from_date_str = from_date.strftime("%Y-%m-%d")
    to_date_str = to_date.strftime("%Y-%m-%d")
    tool_context.state["from_date"] = from_date_str
    tool_context.state["to_date"] = to_date_str

    print(f"✅ Fechas resueltas - FROM_DATE: {from_date_str}, TO_DATE: {to_date_str}")
    return {
        "from_date": from_date_str,
        "to_date": to_date_str,
        "total_zips_found": len(zip_files),
    }


def download_and_parse_chat_range(
    file_id: str, from_date_str: str, tool_context: ToolContext
) -> dict:
    """
    Downloads the WhatsApp ZIP export, extracts it, and parses messages in reverse
    up to from_date_str. Filters messages by SENDER_OF_INTEREST.

    Args:
        file_id: The ID of the ZIP file in Google Drive.
        from_date_str: The oldest date to process (YYYY-MM-DD format).

    Returns:
        A dictionary with the parsed messages, detected attachments, and temporary directory path.
    """
    print(
        f"📡 download_and_parse_chat_range invocado para ID: {file_id}, FROM: {from_date_str}"
    )
    sender_of_interest = os.getenv("SENDER_OF_INTEREST", "Dayher")
    print(f"👤 Emisor de interés: '{sender_of_interest}'")

    creds = get_google_credentials()
    drive_service = build("drive", "v3", credentials=creds)

    # Download ZIP
    temp_dir = f"/tmp/whatsapp-adk-{file_id}_{int(os.path.getmtime('tokens.json') if os.path.exists('tokens.json') else 0)}"
    os.makedirs(temp_dir, exist_ok=True)
    zip_path = os.path.join(temp_dir, "chat.zip")

    request = drive_service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _status, done = downloader.next_chunk()

    with open(zip_path, "wb") as f:
        f.write(fh.getvalue())
    print("✅ ZIP descargado.")

    # Extract ZIP
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(temp_dir)

    # Find chat text file
    files = os.listdir(temp_dir)
    chat_file = next((f for f in files if f.lower() == "_chat.txt"), None)
    if not chat_file:
        chat_file = next(
            (f for f in files if f.lower().endswith(".txt") and not f.startswith(".")),
            None,
        )

    if not chat_file:
        raise FileNotFoundError(
            "No se encontró archivo de conversación .txt en el ZIP."
        )

    chat_path = os.path.join(temp_dir, chat_file)

    with open(chat_path, encoding="utf-8", errors="ignore") as f:
        chat_content = f.read()

    # Parse date range boundary
    try:
        from_date = datetime.strptime(from_date_str, "%Y-%m-%d").date()
    except Exception:
        from_date = date.today() - timedelta(days=30)

    messages = parse_chat_text_reverse(chat_content, from_date, sender_of_interest)
    print(f"✅ Conversación parseada con éxito. Mensajes del emisor: {len(messages)}")

    # Clean up zip file
    if os.path.exists(zip_path):
        os.remove(zip_path)

    # --- Local Speech-to-Text Transcription for Audio Notes ---
    transcribed_count = 0
    whisper_model = None

    for msg in messages:
        att = msg.get("attachment")
        if att:
            ext = os.path.splitext(att)[1].lower()
            if ext in [".opus", ".wav", ".mp3", ".m4a", ".ogg"]:
                audio_path = os.path.join(temp_dir, att)
                if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
                    print(f"🎤 Transcribiendo nota de voz local con Whisper: '{att}'")
                    try:
                        if whisper_model is None:
                            import whisper

                            # Load the tiny model (lightweight, runs fast locally on CPU/GPU)
                            whisper_model = whisper.load_model("tiny")

                        result = whisper_model.transcribe(audio_path, language="es")
                        transcription = result.get("text", "").strip()
                        if transcription:
                            # Append the local transcription to the message text
                            msg["text"] = (
                                f"{msg['text']} [Nota de voz transcrita localmente: {transcription}]"
                            )
                            transcribed_count += 1
                            print(f"✅ Transcripción: '{transcription}'")
                    except Exception as e:
                        print(f"⚠️ Error al transcribir nota de voz {att}: {e}")

    if transcribed_count > 0:
        print(f"🎉 Se transcribieron {transcribed_count} notas de voz localmente.")

    # Gather list of files in directory
    available_files = os.listdir(temp_dir)

    # Save temp_dir to session state
    tool_context.state["temp_dir"] = temp_dir

    return {
        "status": "success",
        "temp_dir": temp_dir,
        "total_messages": len(messages),
        "messages": messages,
        "available_attachments": available_files,
    }


def call_gemini_with_retry(client, model, contents, max_retries=5, base_delay=2.0):
    import time

    # Proactively sleep for 3.0 seconds to prevent hitting RPM (Requests Per Minute) rate limits
    time.sleep(3.0)
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(model=model, contents=contents)
            return response
        except Exception as e:
            error_str = str(e)
            if (
                "429" in error_str
                or "503" in error_str
                or "ResourceExhausted" in error_str
                or "high demand" in error_str.lower()
            ):
                delay = base_delay * (2**attempt)
                print(
                    f"⚠️ Gemini API experimentó alta demanda (503/429). Reintentando en {delay} segundos (Intento {attempt + 1}/{max_retries})..."
                )
                time.sleep(delay)
            else:
                raise e
    raise Exception(
        "Gemini API no disponible después de varios reintentos debido a límites de cuota/demanda."
    )


def transcribe_audio_note(audio_file_name: str, tool_context: ToolContext) -> str:
    """
    Transcribes an audio note (.opus, .wav, .m4a) extracted from the chat log using Gemini.

    Args:
        audio_file_name: The filename of the audio attachment.

    Returns:
        The transcription of the voice note or an error message.
    """
    print(f"🎤 transcribe_audio_note invocado para: {audio_file_name}")
    temp_dir = tool_context.state.get("temp_dir")
    if not temp_dir:
        return "Error: No se ha inicializado el directorio temporal de chats."

    audio_path = os.path.join(temp_dir, audio_file_name)
    if not os.path.exists(audio_path):
        return f"Error: Archivo de audio {audio_file_name} no encontrado."

    if os.path.getsize(audio_path) == 0:
        return "[Audio vacío - Sin contenido (0 bytes)]"

    api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    mime_type = get_mime_type(audio_file_name)

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    response = call_gemini_with_retry(
        client=client,
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            "Transcribe el siguiente audio de WhatsApp. Si el audio contiene indicaciones de tareas o información, transcribe el contenido completo de la forma más exacta posible. No agregues introducciones ni explicaciones adicionales, solo el texto transcrito.",
        ],
    )

    return response.text.strip() if response.text else "Transcripción no disponible."


def describe_chat_image(image_file_name: str, tool_context: ToolContext) -> str:
    """
    Analyzes and describes an image attachment (.jpg, .png, .webp) using Gemini.

    Args:
        image_file_name: The filename of the image attachment.

    Returns:
        A text description summarizing the image's contents.
    """
    print(f"🖼️ describe_chat_image invocado para: {image_file_name}")
    temp_dir = tool_context.state.get("temp_dir")
    if not temp_dir:
        return "Error: No se ha inicializado el directorio temporal de chats."

    image_path = os.path.join(temp_dir, image_file_name)
    if not os.path.exists(image_path):
        return f"Error: Archivo de imagen {image_file_name} no encontrado."

    if os.path.getsize(image_path) == 0:
        return "[Imagen vacía - Sin contenido (0 bytes)]"

    api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    mime_type = get_mime_type(image_file_name)

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = call_gemini_with_retry(
        client=client,
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            "Describe con detalle qué se muestra en esta imagen compartida en un grupo de chat de trabajo (si es una captura de pantalla, describe el texto y lo que representa; si es una foto, resume su contenido relevante para el equipo).",
        ],
    )

    return response.text.strip() if response.text else "Descripción no disponible."


def sync_tasks_to_google(
    task_list_title: str, tasks: list[TaskItem], tool_context: ToolContext
) -> dict:
    """
    Creates a list in Google Tasks and inserts the extracted work tasks.

    Args:
        task_list_title: The name of the new task list.
        tasks: A list of tasks to insert.

    Returns:
        A dictionary summarizing the tasks created and the task list ID.
    """
    print(f"📋 sync_tasks_to_google invocado para lista: {task_list_title}")
    creds = get_google_credentials()
    tasks_service = build("tasks", "v1", credentials=creds)

    # 1. Check if the task list already exists
    tasklist_id = None
    try:
        tasklists_result = tasks_service.tasklists().list().execute()
        tasklists = tasklists_result.get("items", [])
        for tl in tasklists:
            if tl["title"] == task_list_title:
                tasklist_id = tl["id"]
                print(
                    f"[Info] Lista de tareas existente encontrada: '{task_list_title}' (ID: {tasklist_id})"
                )
                break
    except Exception as e:
        print(f"⚠️ Error al listar listas de tareas: {e}")

    # 2. Create the task list if it doesn't exist
    if not tasklist_id:
        tasklist = (
            tasks_service.tasklists().insert(body={"title": task_list_title}).execute()
        )
        tasklist_id = tasklist["id"]
        print(
            f"✅ Creada nueva lista de tareas: '{task_list_title}' (ID: {tasklist_id})"
        )

    # 3. Retrieve existing tasks inside the list to prevent duplicates
    existing_task_titles = set()
    try:
        tasks_result = tasks_service.tasks().list(tasklist=tasklist_id).execute()
        existing_tasks = tasks_result.get("items", [])
        for task in existing_tasks:
            existing_task_titles.add(task["title"].strip().lower())
    except Exception as e:
        print(f"⚠️ Error al recuperar tareas existentes: {e}")

    # Convert Pydantic models to dicts for compatibility
    tasks = [t.model_dump() if hasattr(t, "model_dump") else t for t in tasks]

    tasks_created = []
    for t in tasks:
        title = t.get("title", "Tarea sin título")
        if title.strip().lower() in existing_task_titles:
            print(f"⏭️ Tarea ya existe en la lista: '{title}' (omitida)")
            continue

        body = {
            "title": title,
            "notes": t.get("description", ""),
        }

        due_date = t.get("inferredDueDate") or t.get("dueDate") or t.get("due_date")
        if due_date:
            try:
                # Google Tasks requires ISO 8601 offset format
                date_obj = datetime.strptime(due_date, "%Y-%m-%d")
                body["due"] = date_obj.isoformat() + "Z"
            except Exception:
                pass

        created = (
            tasks_service.tasks().insert(tasklist=tasklist_id, body=body).execute()
        )
        tasks_created.append(created["title"])

    tool_context.state["tasks_created_count"] = len(tasks_created)

    return {
        "status": "success",
        "tasklist_id": tasklist_id,
        "tasks_created_count": len(tasks_created),
        "tasks": tasks_created,
    }


def generate_google_doc(
    doc_title: str,
    info_items: list[InfoItem],
    tool_context: ToolContext,
) -> dict:
    """
    Creates a Google Doc and compiles the info summaries into a structured document.

    Args:
        doc_title: The title of the Google Doc.
        info_items: A list of information items.

    Returns:
        A dictionary with the document ID and public web view URL.
    """
    print(f"📝 generate_google_doc invocado para: {doc_title}")
    temp_dir = tool_context.state.get("temp_dir")
    if not temp_dir:
        return {"status": "error", "message": "No temp_dir in session state"}

    # Convert Pydantic models to dicts for compatibility
    info_items = [
        item.model_dump() if hasattr(item, "model_dump") else item
        for item in info_items
    ]

    creds = get_google_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    docs_service = build("docs", "v1", credentials=creds)

    # 1. Search and delete existing document to avoid duplicates
    try:
        query = f"name='{doc_title}' and mimeType='application/vnd.google-apps.document' and trashed=false"
        results = drive_service.files().list(q=query, fields="files(id)").execute()
        existing_files = results.get("files", [])
        for f in existing_files:
            drive_service.files().delete(fileId=f["id"]).execute()
            print(f"🗑️ Eliminado reporte anterior para evitar duplicados: {f['id']}")
    except Exception as e:
        print(f"⚠️ Error al limpiar reportes anteriores: {e}")

    # 2. Create document
    doc = docs_service.documents().create(body={"title": doc_title}).execute()
    document_id = doc["documentId"]

    # 3. Formulate formatting batch requests
    requests = []
    current_index = 1

    def append_text(text, style=None):
        nonlocal current_index
        requests.append(
            {"insertText": {"text": text, "location": {"index": current_index}}}
        )

        if style:
            requests.append(
                {
                    "updateParagraphStyle": {
                        "paragraphStyle": {"namedStyleType": style},
                        "range": {
                            "startIndex": current_index,
                            "endIndex": current_index + len(text),
                        },
                        "fields": "namedStyleType",
                    }
                }
            )
        current_index += len(text)

    # Title and subtitle
    append_text(f"{doc_title}\n", "TITLE")
    append_text("Documento generado automáticamente en Modo Agente (ADK)\n", "SUBTITLE")

    from_date_str = tool_context.state.get("from_date", "")
    to_date_str = tool_context.state.get("to_date", "")
    append_text(
        f"Intervalo procesado: {from_date_str} a {to_date_str}\n", "NORMAL_TEXT"
    )
    append_text(
        f"Fecha de procesamiento: {datetime.now().strftime('%d/%m/%Y a las %H:%M:%S')}\n\n",
        "NORMAL_TEXT",
    )

    # Section: Information
    if info_items:
        append_text("Información Relevante Compartida\n", "HEADING_1")
        append_text(
            "Esta sección resume los datos útiles, procedimientos y notas técnicas del grupo.\n\n",
            "NORMAL_TEXT",
        )

        for item in info_items:
            append_text(f"{item.get('topic', 'Tema')}\n", "HEADING_2")
            append_text(f"{item.get('summary', '')}\n\n", "NORMAL_TEXT")

    if requests:
        docs_service.documents().batchUpdate(
            documentId=document_id, body={"requests": requests}
        ).execute()

    web_view_link = f"https://docs.google.com/document/d/{document_id}/edit"
    tool_context.state["doc_link"] = web_view_link

    # Clean up temp_dir contents
    import shutil

    try:
        shutil.rmtree(temp_dir)
        print("🧹 Directorio temporal limpiado.")
    except Exception as e:
        print(f"⚠️ Error al limpiar directorio temporal: {e}")

    return {
        "status": "success",
        "document_id": document_id,
        "web_view_link": web_view_link,
    }


def archive_chat_file(file_id: str, tool_context: ToolContext) -> str:
    """
    Moves the processed ZIP file in Google Drive to an "Archived" subfolder.

    Args:
        file_id: The ID of the ZIP file in Google Drive.

    Returns:
        A success message or status.
    """
    print(f"🗂️ archive_chat_file invocado para: {file_id}")
    creds = get_google_credentials()
    drive_service = build("drive", "v3", credentials=creds)

    # Get file metadata to find parent
    file = drive_service.files().get(fileId=file_id, fields="parents, name").execute()
    parents = file.get("parents") or []

    if not parents:
        return "Error: No se encontró carpeta contenedora para archivar el archivo."

    parent_id = parents[0]

    # Check if "Archived" folder exists
    response = (
        drive_service.files()
        .list(
            q=f"mimeType='application/vnd.google-apps.folder' and name='Archived' and '{parent_id}' in parents and trashed=false",
            fields="files(id)",
        )
        .execute()
    )

    if response.get("files"):
        archive_folder_id = response["files"][0]["id"]
    else:
        folder_meta = {
            "name": "Archived",
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        archive_folder = (
            drive_service.files().create(body=folder_meta, fields="id").execute()
        )
        archive_folder_id = archive_folder["id"]

    # Move file
    previous_parents = ",".join(parents)
    drive_service.files().update(
        fileId=file_id,
        addParents=archive_folder_id,
        removeParents=previous_parents,
        fields="id",
    ).execute()

    return f"Archivo ZIP '{file.get('name')}' archivado correctamente."


def log_execution_to_spreadsheet(
    file_id: str,
    total_messages: int,
    voice_notes_count: int,
    tasks_count: int,
    info_count: int,
    tool_context: ToolContext,
) -> dict:
    """
    Logs the execution statistics to the Google Sheet registry.
    Creates the Google Sheet if it does not exist in the parent folder.

    Args:
        file_id: The ID of the ZIP file processed.
        total_messages: The total number of messages processed.
        voice_notes_count: The number of voice notes transcribed.
        tasks_count: The number of tasks created.
        info_count: The number of info notes created.

    Returns:
        A dictionary indicating success and the spreadsheet ID.
    """
    print(
        f"📊 Registrando ejecución en la hoja de cálculo para el archivo ID: {file_id}"
    )
    creds = get_google_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    sheets_service = build("sheets", "v4", credentials=creds)

    # 1. Get file metadata to find parent folder and name
    try:
        file_metadata = (
            drive_service.files().get(fileId=file_id, fields="parents, name").execute()
        )
    except Exception as e:
        print(f"❌ Error al consultar Drive para el archivo {file_id}: {e}")
        return {"status": "error", "message": str(e)}

    parents = file_metadata.get("parents") or []
    if not parents:
        return {"status": "error", "message": "No parent folder found."}
    parent_id = parents[0]
    zip_name = file_metadata.get("name", "Desconocido")

    # 2. Search for the Google Sheet
    sheet_id = None
    try:
        sheet_query = (
            f"name='WhatsApp Agent - Registro de Ejecuciones' and "
            f"mimeType='application/vnd.google-apps.spreadsheet' and "
            f"'{parent_id}' in parents and trashed=false"
        )
        sheet_results = (
            drive_service.files().list(q=sheet_query, fields="files(id)").execute()
        )
        sheet_files = sheet_results.get("files", [])
        if sheet_files:
            sheet_id = sheet_files[0]["id"]
    except Exception as e:
        print(f"⚠️ Error al buscar la hoja de cálculo: {e}")

    # 3. Create the Google Sheet if it does not exist
    if not sheet_id:
        try:
            body = {
                "name": "WhatsApp Agent - Registro de Ejecuciones",
                "mimeType": "application/vnd.google-apps.spreadsheet",
                "parents": [parent_id],
            }
            sheet_file = drive_service.files().create(body=body, fields="id").execute()
            sheet_id = sheet_file.get("id")
            print(f"✅ Nueva hoja de cálculo de registro creada con ID: {sheet_id}")

            # Initialize headers
            headers = [
                [
                    "Fecha Ejecución",
                    "Desde Fecha",
                    "Hasta Fecha",
                    "Archivo ZIP",
                    "Mensajes Procesados",
                    "Notas de Voz Transcritas",
                    "Tareas Creadas",
                    "Notas Informativas",
                    "Enlace Google Doc",
                ]
            ]
            sheets_service.spreadsheets().values().update(
                spreadsheetId=sheet_id,
                range="Sheet1!A1",
                valueInputOption="USER_ENTERED",
                body={"values": headers},
            ).execute()
        except Exception as e:
            print(f"❌ Error al crear e inicializar la hoja de cálculo: {e}")
            return {"status": "error", "message": str(e)}

    # 4. Append execution data
    try:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        from_date = tool_context.state.get("from_date", "")
        to_date = tool_context.state.get("to_date", "")
        doc_link = tool_context.state.get("doc_link", "")

        row_data = [
            [
                now_str,
                from_date,
                to_date,
                zip_name,
                total_messages,
                voice_notes_count,
                tasks_count,
                info_count,
                doc_link,
            ]
        ]

        sheets_service.spreadsheets().values().append(
            spreadsheetId=sheet_id,
            range="Sheet1!A1",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": row_data},
        ).execute()
        print(f"✅ Registro de ejecución añadido correctamente a la hoja: {sheet_id}")
    except Exception as e:
        print(f"❌ Error al añadir fila a la hoja de cálculo: {e}")
        return {"status": "error", "message": str(e)}

    return {
        "status": "success",
        "spreadsheet_id": sheet_id,
        "spreadsheet_name": "WhatsApp Agent - Registro de Ejecuciones",
    }
