import json
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

from dotenv import load_dotenv
from google_auth_oauthlib.flow import Flow

# Scopes needed for Google Tasks, Google Docs, and Google Drive
SCOPES = [
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
]

# Shared flow variable
flow = None


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging HTTP requests to terminal to keep it clean
        return

    def do_GET(self):
        global flow
        # Parse URL
        parsed_path = urllib.parse.urlparse(self.path)

        # Check if the path is the registered redirect path
        if parsed_path.path == "/api/auth/callback":
            # Get code from query params
            query_params = urllib.parse.parse_qs(parsed_path.query)
            code = query_params.get("code")

            if not code:
                self.send_response(400)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    "<h1>Error</h1><p>Código de autorización no proporcionado.</p>".encode()
                )
                return

            try:
                # Exchange code for tokens
                flow.fetch_token(code=code[0])
                creds = flow.credentials

                # Save tokens
                tokens_data = {
                    "access_token": creds.token,
                    "refresh_token": creds.refresh_token,
                    "token_uri": creds.token_uri,
                    "client_id": creds.client_id,
                    "client_secret": creds.client_secret,
                    "scopes": creds.scopes,
                }

                with open("tokens.json", "w", encoding="utf-8") as f:
                    json.dump(tokens_data, f, indent=2)

                # Success response
                self.send_response(200)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    "<h1>¡Autorización Exitosa!</h1><p>Ya puedes cerrar esta pestaña y volver a la terminal.</p>".encode()
                )

                print("\n✅ ¡Autorización Exitosa!")
                print(
                    "🔑 Las credenciales se han guardado correctamente en 'tokens.json'"
                )

                # Exit the server in a separate thread after sending response
                import threading

                def shutdown_server(server):
                    server.shutdown()

                threading.Thread(target=shutdown_server, args=(self.server,)).start()

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    f"<h1>Error de autenticación</h1><p>{e!s}</p>".encode()
                )
                print(f"❌ Error al intercambiar tokens: {e}")
        else:
            # Fallback for other paths
            self.send_response(404)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h1>No encontrado</h1>")


def main():
    global flow
    load_dotenv()

    # Check if we can find a client secret json file in the parent folder or locally
    client_secret_file = None

    # Look in the current directory first
    for f in os.listdir("."):
        if f.startswith("client_secret_") and f.endswith(".json"):
            client_secret_file = f
            break

    # Look in parent directory
    if not client_secret_file:
        parent_dir = os.path.dirname(os.path.abspath("."))
        for f in os.listdir(parent_dir):
            if f.startswith("client_secret_") and f.endswith(".json"):
                client_secret_file = os.path.join(parent_dir, f)
                break

    if not client_secret_file:
        print("❌ Error: No se encontró ningún archivo client_secret_*.json")
        return

    print(f"🔑 Usando archivo de credenciales de Google: {client_secret_file}")

    # Read the file to determine the correct redirect URI
    with open(client_secret_file, encoding="utf-8") as f:
        config_data = json.load(f)

    # Check if the credential has type "web" or "installed"
    is_web = "web" in config_data
    cred_data = config_data.get("web") if is_web else config_data.get("installed")

    if not cred_data:
        print("❌ Error: Formato de credencial no reconocido en el JSON.")
        return

    redirect_uris = cred_data.get("redirect_uris", [])

    # Find a redirect URI that uses localhost on port 3001
    redirect_uri = None
    for uri in redirect_uris:
        if "localhost:3001" in uri:
            redirect_uri = uri
            break

    # Fallback to the first redirect URI or a default one
    if not redirect_uri:
        redirect_uri = (
            redirect_uris[0]
            if redirect_uris
            else "http://localhost:3001/api/auth/callback"
        )

    print(f"🔄 Redireccionando a: {redirect_uri}")

    flow = Flow.from_client_secrets_file(
        client_secret_file, scopes=SCOPES, redirect_uri=redirect_uri
    )

    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")

    print("=====================================================")
    print("🔑 INSTRUCCIONES DE AUTORIZACIÓN DE GOOGLE WORKSPACE")
    print("=====================================================")
    print("1. Abre la siguiente URL en tu navegador:")
    print(f"\n\033[36m{auth_url}\033[0m\n")
    print("2. Concede los permisos a tu cuenta de Google.")
    print("-----------------------------------------------------")
    print("Esperando redirección del navegador en el puerto 3001...")

    # Start the server on port 3001
    server = HTTPServer(("localhost", 3001), OAuthCallbackHandler)
    server.serve_forever()
    print("👋 Servidor de autorización cerrado.")


if __name__ == "__main__":
    main()
