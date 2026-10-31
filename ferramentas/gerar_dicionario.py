#!/usr/bin/env python3
"""
Gera palavras-validas.txt: todas as palavras do português que dá para formar no tabuleiro.

  python -I jogos/rota-do-dia/ferramentas/gerar_dicionario.py <formas.txt> <hyph_pt_BR.dic>

<formas.txt>: uma palavra por linha, expandida do VERO (pt_BR.dic + pt_BR.aff do LibreOffice).
<hyph_pt_BR.dic>: padrões de divisão silábica do LibreOffice (DivSilab).
Os dois são LGPLv3/MPL; os créditos vão no cabeçalho do arquivo gerado.

O tabuleiro só mostra sílabas da lista do jogo (palavras.js). Então guardamos só as palavras cujas
sílabas, todas, existem nessa lista: é o que o jogador consegue traçar, e o arquivo fica pequeno.
"""

import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
JOGO = os.path.dirname(AQUI)
MIN_SILABAS, MAX_SILABAS = 2, 6


def silabas_do_jogo():
    with open(os.path.join(JOGO, "palavras.js"), encoding="utf-8") as f:
        texto = f.read().split("`")[1]
    palavras = [w.upper().split("-") for w in texto.split()]
    return {s for w in palavras for s in w}, {"-".join(w) for w in palavras}


def ler_padroes(caminho):
    padroes = {}
    with open(caminho, encoding="utf-8") as f:
        next(f)  # codificação
        for linha in f:
            p = linha.strip()
            if not p or p.startswith("%") or p.isupper():
                continue
            letras = re.sub(r"\d", "", p)
            valores = [0] * (len(letras) + 1)
            i = 0
            for ch in p:
                if ch.isdigit():
                    valores[i] = int(ch)
                else:
                    i += 1
            padroes[letras] = valores
    return padroes


def separar(palavra, padroes, maior):
    """Algoritmo de Liang: posição com valor ímpar é divisão de sílaba."""
    w = f".{palavra}."
    pontos = [0] * (len(w) + 1)
    for i in range(len(w)):
        for j in range(i + 1, min(len(w), i + maior) + 1):
            v = padroes.get(w[i:j])
            if v:
                for k, x in enumerate(v):
                    pontos[i + k] = max(pontos[i + k], x)
    partes, ini = [], 0
    for i in range(1, len(palavra)):
        if pontos[i + 1] % 2:
            partes.append(palavra[ini:i])
            ini = i
    partes.append(palavra[ini:])
    return partes


def main(formas, hyph):
    pool, curadas = silabas_do_jogo()
    padroes = ler_padroes(hyph)
    maior = max(map(len, padroes))

    # conferência: a separação automática bate com a lista feita à mão?
    diverge = [w for w in sorted(curadas) if "-".join(separar(w.replace("-", "").lower(), padroes, maior)).upper() != w]
    print(f"conferência com palavras.js: {len(curadas) - len(diverge)}/{len(curadas)} iguais")
    for w in diverge[:40]:
        print("  à mão", w, "| automático", "-".join(separar(w.replace("-", "").lower(), padroes, maior)).upper())

    validas = set(curadas)
    with open(formas, encoding="utf-8") as f:
        for linha in f:
            p = linha.strip()
            s = [x.upper() for x in separar(p, padroes, maior)]
            if MIN_SILABAS <= len(s) <= MAX_SILABAS and all(x in pool for x in s):
                validas.add("-".join(s))

    destino = os.path.join(JOGO, "palavras-validas.txt")
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        f.write("# Palavras aceitas no Rota do Dia, separadas em sílabas.\n")
        f.write("# Gerado por ferramentas/gerar_dicionario.py a partir do VERO (verificador ortográfico\n")
        f.write("# do LibreOffice) e do DivSilab (divisor silábico de Raimundo Moura), LGPLv3/MPL:\n")
        f.write("# https://github.com/LibreOffice/dictionaries/tree/master/pt_BR\n")
        for w in sorted(validas):
            f.write(w + "\n")
    print(f"{len(validas)} palavras -> {os.path.relpath(destino)} ({os.path.getsize(destino) // 1024} KB)")


if __name__ == "__main__":
    main(*sys.argv[1:3])
