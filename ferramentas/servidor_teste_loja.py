#!/usr/bin/env python3
"""
Servidor local para testar a interface da loja sem PHP e sem Mercado Pago.

  python -I jogos/rota-do-dia/ferramentas/servidor_teste_loja.py 8131

Serve os arquivos do jogo e imita api/config-loja.php, jogador.php e compras.php (as compras
aprovadas são simuladas: POST /api/_simular {"moedas": 300}). Não cria pagamento de verdade.
"""

import json
import os
import secrets
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

JOGO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESTADO = {"jogadores": {}, "compras": 0, "semAnuncios": False}
PACOTES = [
    {"id": "p300", "nome": "300 moedas", "moedas": 300, "preco": 4.90, "semAnuncios": False},
    {"id": "p800", "nome": "800 moedas", "moedas": 800, "preco": 9.90, "semAnuncios": False},
    {"id": "p2000", "nome": "2.000 moedas", "moedas": 2000, "preco": 19.90, "semAnuncios": False},
    {"id": "semanuncio", "nome": "Sem anúncios de tela cheia", "moedas": 0, "preco": 14.90, "semAnuncios": True},
]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=JOGO, **kw)

    def _json(self, codigo, dados):
        corpo = json.dumps(dados).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path.startswith("/api/config-loja.php"):
            return self._json(200, {"configurada": True, "publica": False, "ambiente": "teste",
                                    "publicKey": "TEST-chave-falsa", "pacotes": PACOTES})
        return super().do_GET()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        dados = json.loads(self.rfile.read(n) or b"{}")
        if self.path == "/api/jogador.php":
            if dados.get("acao") == "novo":
                j, s, c = secrets.token_hex(16), secrets.token_hex(32), "TEST-ABCD-2345"
                ESTADO["jogadores"][j] = s
                return self._json(200, {"ok": True, "jogador": j, "segredo": s, "codigo": c})
            if dados.get("acao") == "recuperar" and dados.get("codigo", "").upper().replace("-", "") == "TESTABCD2345":
                j = next(iter(ESTADO["jogadores"]), secrets.token_hex(16))
                s = secrets.token_hex(32)
                ESTADO["jogadores"][j] = s
                return self._json(200, {"ok": True, "jogador": j, "segredo": s, "codigo": "TEST-ABCD-2345"})
            return self._json(404, {"ok": False})
        if self.path == "/api/compras.php":
            if ESTADO["jogadores"].get(dados.get("jogador")) != dados.get("segredo"):
                return self._json(401, {"ok": False})
            return self._json(200, {"ok": True, "moedasCompradas": ESTADO["compras"],
                                    "semAnuncios": ESTADO["semAnuncios"], "compras": []})
        if self.path == "/api/_simular":
            ESTADO["compras"] += int(dados.get("moedas", 0))
            ESTADO["semAnuncios"] = ESTADO["semAnuncios"] or bool(dados.get("semAnuncios"))
            return self._json(200, {"ok": True})
        return self._json(404, {"ok": False})


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8131
    ThreadingHTTPServer(("127.0.0.1", porta), Handler).serve_forever()
