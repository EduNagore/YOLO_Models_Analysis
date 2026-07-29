#!/usr/bin/env python3
"""Arranca un servidor local y abre la pagina en el navegador.

    python servidor.py            -> http://localhost:8777
    python servidor.py 9000       -> http://localhost:9000

La pagina tambien funciona abriendo index.html directamente (doble clic):
no usa fetch ni modulos ES, todo son <script> planos.
"""

import http.server
import os
import socketserver
import sys
import threading
import webbrowser

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
RAIZ = os.path.dirname(os.path.abspath(__file__))


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def end_headers(self):
        # sin cache: al editar los .js basta con recargar
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, formato, *args):
        pass  # silencio


def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PUERTO), Manejador) as srv:
        url = f"http://localhost:{PUERTO}/index.html"
        print(f"Anatomia del YOLO -> {url}")
        print("Ctrl+C para parar.")
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nParado.")


if __name__ == "__main__":
    main()
