#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Valida os CSVs de flashcards (formato do Gerador de Flashcards).

Formato esperado: UTF-8, separador ';', todos os campos entre aspas duplas,
primeira linha 'Pergunta;Resposta'.
"""
import csv
import io
import os
import re
import sys
import unicodedata

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.join(BASE, "csv")

ANOS = ["EF6", "EF7", "EF8", "EF9", "EM1", "EM2", "EM3"]
ANO_LABEL = {
    "EF6": "6º ano - Ensino Fundamental",
    "EF7": "7º ano - Ensino Fundamental",
    "EF8": "8º ano - Ensino Fundamental",
    "EF9": "9º ano - Ensino Fundamental",
    "EM1": "1º ano - Ensino Medio",
    "EM2": "2º ano - Ensino Medio",
    "EM3": "3º ano - Ensino Medio",
}

# Sequências que indicam lixo de geração de texto
LIXO = re.compile(
    r"(?:\bSUM\b|\bSUMMARY\b|�|锟斤拷|\?\?\?\?|"
    r"[A-Za-z]{0,3}\?\?+[A-Za-z]{0,3}\s|\bTAREF\b|"
    r"<\||\bpython\b|\bdef \b|\bimport \b|\$\{|\{\{)"
)


def parse(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return None, "nao decodifica como UTF-8: %s" % exc
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return list(csv.reader(io.StringIO(text), delimiter=";")), None


def norm(s):
    s = unicodedata.normalize("NFC", s or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def chave_dup(q):
    """Normaliza a pergunta para detectar repeticoes.

    Operadores matematicos sao convertidos em tokens proprio para que
    'x . y' e 'x / y' nao virem a mesma chave.
    """
    s = q.lower()
    s = s.replace("·", " mult ").replace("×", " mult ").replace("*", " mult ")
    s = s.replace("÷", " div ").replace("/", " div ")
    s = s.replace("^", " pot ")
    s = re.sub(r"[^0-9a-z\u00c0-\u024f]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def problema_texto(s):
    """Retorna motivo se o texto parecer lixo, ou None.

    Respostas curtas de matematica ("5", "1/2", "pi . r2 . h", "T = 1 / f")
    sao perfectly validas, entao nao se exige densidade de letras.
    """
    if not s:
        return "vazio"
    if LIXO.search(s):
        return "texto suspeito/lixo"
    if re.search(r"[\u4e00-\u9fff\uac00-\ud7af\u3040-\u30ff]", s):
        return "caracteres CJK/coreanos/japoneses"
    if "\ufffd" in s:
        return "caractere de substituicao"
    if not re.search(r"[0-9A-Za-z\u00c0-\u024f]", s):
        return "sem letras nem digitos (simbolos soltos)"
    # sequencias longas do mesmo caractere nao-alfanumerico: ?, |, ., _ repetidos
    if re.search(r"[^\w\s.,;:()\[\]{}=+*/%<>\"'-]{3,}", s):
        return "sequencia de simbolos repetidos"
    return None


def main():
    arquivos = sorted(f for f in os.listdir(CSV_DIR) if f.lower().endswith(".csv"))
    problemas = []
    avisos = []
    resumo = []
    total = 0
    vglobal = set()

    for nome in arquivos:
        caminho = os.path.join(CSV_DIR, nome)
        linhas, err = parse(caminho)
        if err:
            problemas.append((nome, 0, err))
            continue
        if not linhas:
            problemas.append((nome, 0, "arquivo vazio"))
            continue
        cab = [norm(c) for c in linhas[0]]
        if not (cab and "pergunt" in cab[0].lower()) or not (
            cab[1:2] and "respost" in cab[1].lower()
        ):
            problemas.append((nome, 1, "cabecalho invalido: %r" % (linhas[0],)))
        n = 0
        vistos = set()
        for i, row in enumerate(linhas[1:], start=2):
            if not row or not norm("".join(row)):
                continue
            if len(row) != 2:
                problemas.append((nome, i, "%d colunas (esperado 2): %r" % (len(row), row[:3])))
                continue
            q, a = norm(row[0]), norm(row[1])
            pq = problema_texto(q)
            pa = problema_texto(a)
            if pq or pa:
                problemas.append((nome, i, "Q:%s | A:%s | Q=%r A=%r" % (pq, pa, q[:70], a[:70])))
                continue
            if len(q) < 8:
                problemas.append((nome, i, "pergunta curta demais: %r" % q))
                continue
            if len(q) > 300:
                problemas.append((nome, i, "pergunta longa demais (%d): %r" % (len(q), q[:60])))
                continue
            if len(a) > 600:
                problemas.append((nome, i, "resposta longa demais (%d)" % len(a)))
                continue
            chave = chave_dup(q)
            if chave in vistos:
                problemas.append((nome, i, "pergunta duplicada no arquivo: %r" % q[:70]))
                continue
            vistos.add(chave)
            gchave = (nome.split("-")[0], chave)
            if gchave in vglobal:
                avisos.append((nome, i, "mesma pergunta em outro arquivo do ano: %r" % q[:70]))
            vglobal.add(gchave)
            n += 1
        resumo.append((nome, n))
        total += n

    print("=" * 66)
    print("VALIDACAO DOS CSVs")
    print("=" * 66)
    for ano in ANOS:
        sub = [(n, c) for n, c in resumo if n.startswith(ano)]
        if not sub:
            continue
        print("  %s  (%d cartoes)" % (ANO_LABEL[ano], sum(c for _, c in sub)))
        for nome, n in sub:
            print("      %-28s %4d" % (nome[len(ano) + 1:-4], n))
    print("-" * 66)
    print("  %-30s %4d cartoes  em %d arquivos" % ("TOTAL", total, len(resumo)))
    print()
    if avisos:
        print("AVISOS (sobreposicao entre materias, permitido): %d" % len(avisos))
        for nome, ln, msg in avisos[:10]:
            print("  [%s:%d] %s" % (nome, ln, msg))
        print()
    if problemas:
        print("PROBLEMAS ENCONTRADOS: %d" % len(problemas))
        for nome, ln, msg in problemas[:80]:
            print("  [%s:%d] %s" % (nome, ln, msg))
        if len(problemas) > 80:
            print("  ... e mais %d" % (len(problemas) - 80))
        return 1
    print("OK: nenhum problema encontrado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
