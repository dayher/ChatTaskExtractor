import json
import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials


def get_google_credentials():
    """
    Loads OAuth2 credentials from the local tokens.json file.
    Auto-refreshes expired credentials and writes them back to the disk.
    """
    # We look for tokens.json in the project root folder
    token_path = os.path.abspath("tokens.json")

    if not os.path.exists(token_path):
        raise FileNotFoundError(
            "No se han encontrado credenciales de Google. "
            "Por favor ejecuta el flujo de autorización o coloca un tokens.json válido."
        )

    with open(token_path, encoding="utf-8") as f:
        tokens_data = json.load(f)

    # Check configuration for client ID/secret from environment if not in tokens.json
    client_id = os.getenv("GOOGLE_CLIENT_ID", tokens_data.get("client_id"))
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", tokens_data.get("client_secret"))
    token_uri = tokens_data.get("token_uri", "https://oauth2.googleapis.com/token")
    scopes = tokens_data.get(
        "scopes",
        [
            "https://www.googleapis.com/auth/tasks",
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive",
        ],
    )

    creds = Credentials(
        token=tokens_data.get("access_token"),
        refresh_token=tokens_data.get("refresh_token"),
        token_uri=token_uri,
        client_id=client_id,
        client_secret=client_secret,
        scopes=scopes,
    )

    # Refresh the credentials if they are expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            # Save the refreshed credentials back to tokens.json
            updated_tokens = {
                "access_token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": creds.scopes,
            }
            with open(token_path, "w", encoding="utf-8") as f:
                json.dump(updated_tokens, f, indent=2)
            print("🔄 Tokens de Google refrescados y guardados en tokens.json.")
        except Exception as e:
            print(f"⚠️ Error al refrescar tokens de Google: {e}")

    return creds
