#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera csv/index.html: catalogo dos arquivos CSV prontos para o Gerador de Flashcards."""
import csv
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_site import ANOS, MATERIAS, parse, js_str  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.join(BASE, "csv")

PAG = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Arquivos CSV — Flashcards da BNCC</title>
<link rel="stylesheet" href="../assets/style.css">
<style>
  .dica { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--brand);
          border-radius: 12px; padding: 16px 18px; margin: 18px 0 26px; font-size: 14px; }
  .dica ol { margin: 8px 0 0 20px; color: var(--muted); }
  .dica li { margin: 4px 0; }
  .dica code, code { background: var(--surface-2); border: 1px solid var(--line); border-radius: 5px;
                     padding: 1px 6px; font-size: 12.5px; }
  .download { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 9px;
              background: var(--surface-2); border: 1.5px solid var(--line); font-size: 13px;
              font-weight: 600; text-decoration: none; }
  .download:hover { border-color: var(--brand); color: var(--brand); }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo"><div class="topo-inner">
  <a class="marca" href="../index.html"><span class="logo">🎴</span>
    <span>Arquivos CSV<small>prontos para o Gerador de Flashcards</small></span></a>
</div></header>

<main id="conteudo" style="max-width:900px">
  <h1 style="font-size:1.7rem;letter-spacing:-.02em;margin:6px 0 4px">Arquivos CSV</h1>
  <p style="color:var(--muted)">
    __TOTAL__ cartões em __N__ arquivos, separados por série e disciplina.
    Cada arquivo tem duas colunas (<b>Pergunta</b> e <b>Resposta</b>) e usa ponto e vírgula como separador.
  </p>

  <div class="dica">
    <b>Como gerar o PDF para imprimir</b>
    <ol>
      <li>Baixe o CSV da disciplina desejada (botão <b>baixar</b> abaixo).</li>
      <li>Abra o <a href="https://elizeubarbosa.com.br/ferramentas/gerador-flashcards.html" target="_blank" rel="noopener">Gerador de Flashcards</a>.</li>
      <li>Expanda <b>Importar de CSV</b> e arraste o arquivo (ou use <b>Escolher CSV</b>).</li>
      <li>Deixe o separador em <b>Detectar</b> — ele reconhece o ponto e vírgula sozinho — e marque
          <b>Primeira linha é cabeçalho</b>.</li>
      <li>Escolha 4, 6 ou 12 cartões por folha, confira a prévia e clique em <b>Baixar PDF</b>.</li>
    </ol>
    <p style="margin-top:10px;color:var(--muted)">
      Dica: para juntar vários arquivos, marque <b>Adicionar aos existentes</b> antes de importar o próximo.
    </p>
  </div>

__TABELAS__

  <div style="margin:26px 0 8px"><a class="btn btn-neutro" href="../index.html">← Voltar ao site de estudos</a></div>
</main>

<footer class="rodape"><p>Material de estudo alinhado à BNCC, com fins educativos.</p></footer>
</body>
</html>
"""


def main():
    tabelas = []
    total = 0
    n = 0
    for prefixo, curto, completo, etapa, cor, icone in ANOS:
        linhas = []
        sub = 0
        for sufixo, mid, materia, area, emoji in MATERIAS:
            fname = "%s-%s.csv" % (prefixo, sufixo)
            caminho = os.path.join(CSV_DIR, fname)
            if not os.path.exists(caminho):
                continue
            c = len(parse(caminho))
            if not c:
                continue
            sub += c
            n += 1
            linhas.append(
                '<tr><td>{} {}</td><td style="color:var(--muted)">{}</td><td class="n">{}</td>'
                '<td class="n"><a class="download" href="{}" download>baixar</a></td></tr>'
                .format(emoji, materia, area, c, fname)
            )
        if not linhas:
            continue
        total += sub
        tabelas.append(
            '<div class="rodape-secao"><h2>{}</h2><p>{} cartões em {} disciplinas</p></div>\n'
            '<div class="painel-series"><table><thead><tr><th>Disciplina</th><th>Área</th>'
            '<th class="n">Cartões</th><th class="n"></th></tr></thead><tbody>{}</tbody></table></div>\n'
            .format(completo, sub, len(linhas), "\n".join(linhas))
        )

    html = (PAG.replace("__TOTAL__", "{:,}".format(total).replace(",", "."))
                .replace("__N__", str(n))
                .replace("__TABELAS__", "\n".join(tabelas)))
    with open(os.path.join(CSV_DIR, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(html)
    print("csv/index.html gerado: %d arquivos, %d cartoes" % (n, total))
    return 0


if __name__ == "__main__":
    sys.exit(main())
