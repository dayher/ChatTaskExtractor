# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import os

import google.auth
from fastapi import FastAPI
from google.adk.cli.fast_api import get_fast_api_app

# Imports for programmatically running the Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.cloud import logging as google_cloud_logging
from google.genai import types

from app.app_utils.telemetry import setup_telemetry
from app.app_utils.typing import Feedback

setup_telemetry()
try:
    _, project_id = google.auth.default()
except Exception:
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "dummy-project-id")

try:
    logging_client = google_cloud_logging.Client()
    logger = logging_client.logger(__name__)
except Exception:
    import logging

    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    # Add mock method to prevent crashes
    logger.log_struct = lambda d, severity="INFO": logger.info(f"Feedback struct: {d}")
allow_origins = (
    os.getenv("ALLOW_ORIGINS", "").split(",") if os.getenv("ALLOW_ORIGINS") else None
)

# Artifact bucket for ADK (created by Terraform, passed via env var)
logs_bucket_name = os.environ.get("LOGS_BUCKET_NAME")

AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# In-memory session configuration - no persistent storage
session_service_uri = None

artifact_service_uri = f"gs://{logs_bucket_name}" if logs_bucket_name else None

app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    web=True,
    artifact_service_uri=artifact_service_uri,
    allow_origins=allow_origins,
    session_service_uri=session_service_uri,
    otel_to_cloud=False,
)
app.title = "whatsapp-adk-agent"
app.description = "API for interacting with the Agent whatsapp-adk-agent"


@app.post("/feedback")
def collect_feedback(feedback: Feedback) -> dict[str, str]:
    """Collect and log feedback.

    Args:
        feedback: The feedback data to log

    Returns:
        Success message
    """
    logger.log_struct(feedback.model_dump(), severity="INFO")
    return {"status": "success"}


@app.post("/api/agent-trigger")
async def agent_trigger(payload: dict) -> dict:
    """Webhook triggered by Google Apps Script.

    Receives:
        { "fileId": "...", "fileName": "..." }
    """
    file_id = payload.get("fileId")
    file_name = payload.get("fileName")

    if not file_id:
        print("❌ Error: Webhook invocado sin fileId.")
        return {"success": False, "error": "Falta el parámetro fileId."}

    clean_file_name = (
        file_name
        or f"whatsapp_chat_{int(os.path.getmtime('tokens.json') if os.path.exists('tokens.json') else 0)}"
    )
    print(f"\n🚀 Webhook activado para procesar: '{clean_file_name}' (ID: {file_id})")

    try:
        # 1. Initialize session service and create a unique session
        session_service = InMemorySessionService()
        session_id = f"session_{file_id}"
        await session_service.create_session(
            app_name="app", user_id="user", session_id=session_id
        )

        # 2. Instantiate runner with the root agent
        from app.agent import root_agent

        runner = Runner(
            agent=root_agent, app_name="app", session_service=session_service
        )

        # 3. Formulate the prompt
        prompt = f"Procesa el archivo ZIP de WhatsApp con ID de Drive: {file_id} y nombre: {clean_file_name}"

        # 4. Run the agent execution loop
        print(f"🤖 Iniciando ejecución del Agente ADK con prompt: '{prompt}'...")
        async for event in runner.run_async(
            user_id="user",
            session_id=session_id,
            new_message=types.Content(
                role="user", parts=[types.Part.from_text(text=prompt)]
            ),
        ):
            # Log the event name or details
            print(
                f"[ADK Event] {event.author}: {event.content.parts[0].text if event.content and event.content.parts else 'No text'}"
            )

        # 5. Extract results from session state
        session = await session_service.get_session(
            app_name="app", user_id="user", session_id=session_id
        )
        doc_link = session.state.get("doc_link")
        tasks_created = session.state.get("tasks_created_count", 0)

        print(
            f"🎉 ¡Proceso del agente completado! Documento: {doc_link}, Tareas: {tasks_created}"
        )
        return {"success": True, "docLink": doc_link, "tasksCreated": tasks_created}

    except Exception as error:
        print(f"❌ Error de procesamiento en el agente: {error}")
        return {"success": False, "error": str(error)}


# Main execution
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
