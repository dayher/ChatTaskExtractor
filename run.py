import asyncio
import sys

from dotenv import load_dotenv
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


async def main():
    load_dotenv()

    file_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not file_id:
        print("Uso: uv run run.py <FILE_ID_DE_GOOGLE_DRIVE> [FILE_NAME]")
        sys.exit(1)

    file_name = sys.argv[2] if len(sys.argv) > 2 else "whatsapp_chat_test.zip"

    # Initialize session
    session_service = InMemorySessionService()
    session_id = f"cli_session_{int(asyncio.get_event_loop().time())}"
    await session_service.create_session(
        app_name="app", user_id="cli_user", session_id=session_id
    )

    # Import root agent
    from app.agent import root_agent

    runner = Runner(agent=root_agent, app_name="app", session_service=session_service)

    prompt = f"Procesa el archivo ZIP de WhatsApp con ID de Drive: {file_id} y nombre: {file_name}"
    print("🚀 Iniciando Agente ADK localmente...")
    print(f"Prompt: {prompt}\n")

    try:
        async for event in runner.run_async(
            user_id="cli_user",
            session_id=session_id,
            new_message=types.Content(
                role="user", parts=[types.Part.from_text(text=prompt)]
            ),
        ):
            text = (
                event.content.parts[0].text
                if event.content and event.content.parts
                else ""
            )
            print(f"[{event.author}] {text}")

        session = await session_service.get_session(
            app_name="app", user_id="cli_user", session_id=session_id
        )
        doc_link = session.state.get("doc_link")
        tasks_count = session.state.get("tasks_created_count", 0)

        print("\n" + "=" * 50)
        print("🎉 PROCESAMIENTO COMPLETADO CON ÉXITO")
        print("=" * 50)
        print(f"📝 Google Doc Link: {doc_link}")
        print(f"📋 Tareas creadas: {tasks_count}")
        print("=" * 50)

    except Exception as e:
        print(f"\n❌ Error durante la ejecución del agente: {e}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
