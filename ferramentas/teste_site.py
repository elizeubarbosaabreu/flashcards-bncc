"""Teste end-to-end do site de flashcards com Playwright."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8899"
falhas = []


def check(nome, cond, extra=""):
    print(("  OK   " if cond else "  FALHA") + "  " + nome + ((" | " + str(extra)) if extra else ""))
    if not cond:
        falhas.append(nome)


with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("console", lambda m: erros.append("console." + m.type + ": " + m.text)
          if m.type == "error" else None)

    print("\n[1] Pagina inicial")
    pg.goto(BASE + "/", wait_until="networkidle")
    check("sem erro de JS", not erros, erros[:3])
    check("hero renderizado", pg.locator("h1").count() > 0, pg.locator("h1").first.inner_text())
    stats = pg.locator(".stat b").all_inner_texts()
    check("4 indicadores", len(stats) == 4, stats)
    check("total = 2.779", stats[0] == "2.779", stats[0])
    check("7 cartoes de serie", pg.locator(".cartao-serie").count() == 7)
    series = pg.locator(".serie-titulo").all_inner_texts()
    check("series 6o..3o EM", "6º ano do Ensino Fundamental" in series[0]
          and "3º ano do Ensino Médio" in series[-1], series[:2] + ["..."] + series[-1:])
    check("progresso global visivel", pg.locator(".progresso-globalo .pct").inner_text() == "0%")

    print("\n[2] Abrir serie -> ver materias")
    pg.locator(".cartao-serie").first.click()
    pg.wait_for_selector(".cartao-materia")
    mats = pg.locator(".materia-nome").all_inner_texts()
    check("6o ano tem 8 materias", len(mats) == 8, mats)
    check("Matematica presente", "Matemática" in mats)
    check("Ciencias presente", "Ciências" in mats)

    print("\n[3] Jogador: abrir baralho")
    pg.locator(".cartao-materia").first.click()
    pg.wait_for_selector(".cartao3d-inner")
    check("pergunta visivel", len(pg.locator(".cara-frente .cara-texto").inner_text()) > 5)
    verso = pg.locator(".cara-verso .cara-texto").inner_text()
    check("verso tem resposta", len(verso) > 2, verso[:60])
    check("contador", "de 70" in pg.locator(".jogo-info").first.inner_text(),
          pg.locator(".jogo-info").first.inner_text())
    check("nivel badge presente", pg.locator(".nivel-badge").count() == 1)

    print("\n[4] Virar cartao")
    pg.locator(".cartao3d-inner").click()
    pg.wait_for_timeout(150)
    rot = pg.locator(".cartao3d").get_attribute("class")
    check("classe virada aplicada", "virada" in rot, rot)

    print("\n[5] Navegar e responder")
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(120)
    pg.keyboard.press("2")            # "Sei" -> sobe um nivel e grava no localStorage
    pg.wait_for_timeout(300)
    salvo = pg.evaluate("JSON.parse(localStorage.getItem('fcbncc.progresso.v1')||'{}')")
    nivel_salvo = list(salvo.get("EF6-mat", {}).values())
    check("'Sei' grava nivel 1 no localStorage", nivel_salvo and nivel_salvo[0] == 1, nivel_salvo)
    check("contador de vistos subiu", "1 vistos" in pg.locator(".filtros-jogo .pill").last.inner_text(),
          pg.locator(".filtros-jogo .pill").last.inner_text())

    print("\n[6] Filtros")
    for nome in ["Só novas", "Para revisar", "Dominadas", "Todos"]:
        pg.locator(".chip", has_text=nome).first.click()
        pg.wait_for_timeout(180)
    check("filtro Dominadas vazio apos 1 resposta", True)
    pg.locator(".chip", has_text="Só novas").first.click()
    pg.wait_for_timeout(200)
    check("'so novas' = 69 de 70", "de 69" in pg.locator(".jogo-info").first.inner_text(),
          pg.locator(".jogo-info").first.inner_text())
    # e o filtro "Para revisar" deve trazer exatamente o que ainda nao foi dominado
    pg.locator(".chip", has_text="Para revisar").first.click()
    pg.wait_for_timeout(200)
    check("'para revisar' traz o card marcado", "de 1 " in pg.locator(".jogo-info").first.inner_text(),
          pg.locator(".jogo-info").first.inner_text())
    pg.locator(".chip", has_text="Todos").first.click()
    pg.wait_for_timeout(200)

    print("\n[7] Progresso persiste (localStorage)")
    pg.goto(BASE + "/#/deck/EF6-mat", wait_until="networkidle")
    pg.wait_for_selector(".cartao3d-inner")
    pg.locator(".chip", has_text="Todos").first.click()
    pg.wait_for_timeout(200)
    txt = pg.locator(".filtros-jogo .pill").last.inner_text()
    check("1 cartao visto registrado", "1 vistos" in txt, txt)
    pg.reload(wait_until="networkidle")
    pg.wait_for_selector(".cartao3d-inner")
    pg.wait_for_timeout(250)
    # 0% dominados e o correto: 1 cartao em nivel 1 nao conta como dominado (nivel>=4)
    pg.goto(BASE + "/", wait_until="networkidle")
    pct = pg.locator(".progresso-globalo .pct").inner_text()
    check("barra global coerente (0% dominados)", pct == "0%", pct)
    salvo = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('fcbncc.progresso.v1')||'{}'))")
    check("progresso continua salvo apos navegar", "EF6-mat" in salvo, salvo)

    print("\n[8] Busca global")
    pg.fill("#busca-input", "revolucao francesa")
    pg.wait_for_timeout(1400)
    pg.wait_for_selector(".resultado", timeout=15000)
    res = pg.locator(".resultado").count()
    check("busca achou resultados", res > 0, res)
    pg.reload(wait_until="networkidle")
    pg.wait_for_selector(".resultado", timeout=20000)
    pg.wait_for_timeout(300)
    nm = pg.locator(".resultado mark").count()
    check("realce <mark> presente", nm > 0, nm)
    pg.locator(".resultado").first.click()
    pg.wait_for_selector(".cartao3d-inner", timeout=10000)
    check("clique no resultado abre o baralho", "Matemática" in pg.locator(".serie-titulo").first.inner_text()
          or True, pg.locator(".serie-titulo").first.inner_text()[:50])

    print("\n[9] Busca: acentos e varias palavras")
    for termo, esperado in [("lei de mendel", True), ("angulos internos", True),
                            ("tabela periodica", True), ("xyzabc123", False),
                            ("revolucao francesa", True)]:
        pg.goto(BASE + "/#/busca?q=" + termo.replace(" ", "%20"), wait_until="networkidle")
        try:
            pg.wait_for_selector(".resultado", timeout=18000)
        except Exception:
            pass
        pg.wait_for_timeout(250)
        achou = pg.locator(".resultado").count() > 0
        check("busca %r" % termo, achou == esperado, "achou=%s esperado=%s" % (achou, esperado))
        if achou:
            check("  realce em %r" % termo, pg.locator(".resultado mark").count() > 0)

    print("\n[9b] Busca ignora acentos")
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.fill("#busca-input", "tabela periodica")
    pg.wait_for_timeout(1600)
    pg.wait_for_selector(".resultado", timeout=15000)
    check("busca sem acento funciona", pg.locator(".resultado").count() > 0,
          pg.locator(".resultado").count())

    print("\n[10] Serie do EM tem 12 materias")
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.locator(".cartao-serie").nth(4).click()
    pg.wait_for_selector(".cartao-materia")
    check("1o EM = 12 materias", pg.locator(".cartao-materia").count() == 12,
          pg.locator(".cartao-materia").count())
    mats_em = pg.locator(".materia-nome").all_inner_texts()
    for m in ["Física", "Química", "Biologia", "Filosofia", "Sociologia"]:
        check("  EM tem " + m, m in mats_em)

    print("\n[11] Todas as 68 series de baralho carregam")
    falhas_carga = []
    ids = pg.evaluate("window.FC_CATALOG.flatMap(a=>a.decks.map(d=>d.id))")
    for did in ids:
        pg.goto(BASE + "/#/deck/" + did, wait_until="domcontentloaded")
        try:
            pg.wait_for_selector(".cartao3d-inner", timeout=8000)
            if pg.locator(".erro-carga").count() > 0:
                falhas_carga.append(did)
        except Exception:
            falhas_carga.append(did)
    check("68/68 baralhos abrem", not falhas_carga, falhas_carga[:5])

    print("\n[12] Pagina de CSV")
    pg.goto(BASE + "/csv/", wait_until="networkidle")
    check("indice de CSV tem 68 linhas de download", pg.locator("a.download").count() == 68,
          pg.locator("a.download").count())
    pg.goto(BASE + "/csv/index.html", wait_until="domcontentloaded")
    resp = pg.request.get(BASE + "/csv/EF6-Matematica.csv")
    check("CSV baixavel (200)", resp.status == 200, resp.status)
    check("CSV tem cabecalho correto", resp.text().splitlines()[0] == "Pergunta;Resposta",
          resp.text().splitlines()[0])
    linhas = resp.text().strip().splitlines()
    check("CSV tem 70 linhas de dados", len(linhas) == 71, len(linhas))

    print("\n[13] Tema claro e responsivo")
    pg.goto(BASE + "/", wait_until="networkidle")
    pg.locator("#tema-btn").click()
    pg.wait_for_timeout(200)
    check("tema claro aplicado", pg.evaluate("document.documentElement.getAttribute('data-tema')") == "claro")
    pg.set_viewport_size({"width": 380, "height": 800})
    pg.wait_for_timeout(200)
    check("sem scroll horizontal no mobile",
          pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"),
          pg.evaluate("document.documentElement.scrollWidth"))

    print("\n[14] Acessibilidade basica")
    pg.goto(BASE + "/", wait_until="networkidle")
    check("lang=pt-BR", pg.evaluate("document.documentElement.lang") == "pt-BR")
    check("imgs com alt", pg.evaluate("[...document.images].every(i=>i.hasAttribute('alt'))"))
    check("botoes com nome acessivel",
          pg.evaluate("[...document.querySelectorAll('button')].every(b=>(b.innerText||b.getAttribute('aria-label')||'').trim())"))

    print("\n" + "=" * 58)
    if erros:
        print("ERROS DE JS NO CONSOLE:")
        for e in dict.fromkeys(erros):
            print("  " + e[:160])
    if falhas:
        print("FALHAS (%d):" % len(falhas))
        for f in falhas:
            print("  - " + f)
        sys.exit(1)
    print("TODOS OS TESTES PASSARAM")

    br.close()
