#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Converte os CSVs de csv/ em dados para o site (data/decks/*.js + data/catalog.js).

Cada deck vira um arquivo que registra `window.FC_DECK_<ID>`, carregado sob
demanda pelo index.html (funciona tambem abrindo o arquivo direto no disco,
sem servidor, porque usa tag <script>).
"""
import csv
import io
import json
import os
import re
import sys
import unicodedata

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.join(BASE, "csv")
DATA_DIR = os.path.join(BASE, "data")
DECKS_DIR = os.path.join(DATA_DIR, "decks")

# ordem de apresentacao: (prefixo, rotulo curto, rotulo completo, etapa, cor, icone)
ANOS = [
    ("EF6", "6º ano", "6º ano do Ensino Fundamental", "EF", "#0ea5e9", "6"),
    ("EF7", "7º ano", "7º ano do Ensino Fundamental", "EF", "#06b6d4", "7"),
    ("EF8", "8º ano", "8º ano do Ensino Fundamental", "EF", "#14b8a6", "8"),
    ("EF9", "9º ano", "9º ano do Ensino Fundamental", "EF", "#10b981", "9"),
    ("EM1", "1º ano", "1º ano do Ensino Médio", "EM", "#f59e0b", "1"),
    ("EM2", "2º ano", "2º ano do Ensino Médio", "EM", "#f97316", "2"),
    ("EM3", "3º ano", "3º ano do Ensino Médio", "EM", "#ef4444", "3"),
]

# (sufixo do arquivo, id do deck, nome, materia, area, emoji)
MATERIAS = [
    ("Matematica", "mat", "Matemática", "Linguagens e Matemática", "📐"),
    ("Portugues", "port", "Língua Portuguesa", "Linguagens e Matemática", "📖"),
    ("Ingles", "ing", "Língua Inglesa", "Linguagens e Matemática", "🗣️"),
    ("Ciencias", "cien", "Ciências", "Ciências da Natureza", "🔬"),
    ("Fisica", "fis", "Física", "Ciências da Natureza", "⚡"),
    ("Quimica", "qui", "Química", "Ciências da Natureza", "🧪"),
    ("Biologia", "bio", "Biologia", "Ciências da Natureza", "🧬"),
    ("Historia", "his", "História", "Ciências Humanas e Sociais", "🏛️"),
    ("Geografia", "geo", "Geografia", "Ciências Humanas e Sociais", "🌎"),
    ("Filosofia", "fil", "Filosofia", "Ciências Humanas e Sociais", "🏛️"),
    ("Sociologia", "soc", "Sociologia", "Ciências Humanas e Sociais", "👥"),
    ("Arte", "art", "Arte", "Linguagens e Matemática", "🎨"),
    ("EducacaoFisica", "edf", "Educação Física", "Linguagens e Matemática", "⚽"),
]


def parse(path):
    raw = open(path, "rb").read()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    text = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    linhas = list(csv.reader(io.StringIO(text), delimiter=";"))
    out = []
    for row in linhas[1:]:
        if not row or not "".join(row).strip():
            continue
        if len(row) < 2:
            continue
        q = re.sub(r"\s+", " ", (row[0] or "")).strip()
        a = re.sub(r"\s+", " ", (row[1] or "")).strip()
        if q and a:
            out.append((q, a))
    return out


def ident(nome):
    s = unicodedata.normalize("NFKD", nome)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper()
    return s


def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def main():
    os.makedirs(DECKS_DIR, exist_ok=True)
    for f in os.listdir(DECKS_DIR):
        if f.endswith(".js"):
            os.remove(os.path.join(DECKS_DIR, f))

    catalogo = []
    total = 0
    faltando = []

    for prefixo, curto, completo, etapa, cor, icone in ANOS:
        decks_ano = []
        for sufixo, mid, materia, area, emoji in MATERIAS:
            fname = "%s-%s.csv" % (prefixo, sufixo)
            caminho = os.path.join(CSV_DIR, fname)
            if not os.path.exists(caminho):
                continue
            cartoes = parse(caminho)
            if not cartoes:
                continue
            deck_id = "%s-%s" % (prefixo, mid)
            nome = "%s - %s" % (materia, curto)
            var = "FC_DECK_" + ident(deck_id)

            js = (
                "/* %s | gerado por ferramentas/gerar_site.py a partir de csv/%s"
                " | nao edite a mao: altere o CSV e regenere. */\n"
                "window.%s = {\n"
                "  id: %s,\n"
                "  ano: %s,\n"
                "  anoCurto: %s,\n"
                "  anoCompleto: %s,\n"
                "  etapa: %s,\n"
                "  materia: %s,\n"
                "  area: %s,\n"
                "  cor: %s,\n"
                "  emoji: %s,\n"
                "  csv: %s,\n"
                "  cards: [\n"
                "%s"
                "  ]\n"
                "};\n"
            ) % (
                nome,
                fname,
                var,
                js_str(deck_id),
                js_str(prefixo),
                js_str(curto),
                js_str(completo),
                js_str(etapa),
                js_str(materia),
                js_str(area),
                js_str(cor),
                js_str(emoji),
                js_str("csv/" + fname),
                "".join(
                    "    [%s, %s],\n" % (js_str(q), js_str(a)) for q, a in cartoes
                ),
            )
            with open(os.path.join(DECKS_DIR, deck_id + ".js"), "w", encoding="utf-8") as fh:
                fh.write(js)

            decks_ano.append(
                {
                    "id": deck_id,
                    "materia": materia,
                    "area": area,
                    "emoji": emoji,
                    "cor": cor,
                    "csv": "csv/" + fname,
                    "n": len(cartoes),
                }
            )
            total += len(cartoes)

        if not decks_ano:
            faltando.append(prefixo)
            continue
        catalogo.append(
            {
                "id": prefixo,
                "curto": curto,
                "completo": completo,
                "etapa": etapa,
                "cor": cor,
                "icone": icone,
                "n": sum(d["n"] for d in decks_ano),
                "decks": decks_ano,
            }
        )

    if faltando:
        print("AVISO: series sem CSV: %s" % ", ".join(faltando))

    with open(os.path.join(DATA_DIR, "catalog.js"), "w", encoding="utf-8") as fh:
        fh.write(
            "/* Catalogo de baralhos - gerado por ferramentas/gerar_site.py. */\n"
            "window.FC_CATALOG = %s;\n" % json.dumps(catalogo, ensure_ascii=False, indent=2)
        )

    print("%d baralhos | %d cartoes | %d series"
          % (sum(len(a["decks"]) for a in catalogo), total, len(catalogo)))
    for a in catalogo:
        print("  %-38s %5d cartoes  (%d materias)" % (a["completo"], a["n"], len(a["decks"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
