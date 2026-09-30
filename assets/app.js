/* Flashcards BNCC - aplicacao do site de estudos.
   Sem dependencias externas. Funciona abrindo index.html direto do disco. */
(function () {
  "use strict";

  /* ===================== Constantes e estado ===================== */

  var CHAVE_PROG = "fcbncc.progresso.v1";
  var CHAVE_PREF = "fcbncc.prefs.v1";
  var NIVEIS_MAX = 5;           // nivel 5 = dominado (Leitner)
  var NIVEL_MESTRE = 4;         // a partir daqui a carta entra em "dominadas"

  var catalogo = window.FC_CATALOG || [];
  var indiceDecks = {};         // id -> metadados do catalogo
  var decksCarregados = {};     // id -> deck completo
  var progresso = carregarJson(CHAVE_PROG, {});
  var prefs = carregarJson(CHAVE_PREF, { tema: "escuro", soNovas: false, soDifceis: false });

  var estado = {
    rota: null,          // {tipo:'home'|'deck'|'busca', ...}
    deckAtual: null,
    indice: 0,
    virado: false,
    ordem: [],
    filtro: "todos",     // todos | novas |WV
    carregando: false
  };

  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  var el = function (tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };

  // Escopo de corpo: permite isolar o app do CSS do site quando o app e
  // embutido nas paginas do portfolio (o mesmo arquivo roda no repo solto).
  document.body.classList.add("fc-app");

  // O endereco do Gerador de Flashcards muda conforme onde o app roda: dentro
  // do site ele e um caminho relativo, no repositorio solto e a URL do site.
  // Por convencao do site, link para o proprio dominio abre na mesma aba.
  var LINK_GERADOR = document.body.getAttribute("data-gerador") ||
    "https://www.elizeubarbosa.com.br/ferramentas/gerador-flashcards.html";

  /* ===================== Persistencia ===================== */

  function carregarJson(chave, padrao) {
    try {
      var v = localStorage.getItem(chave);
      return v ? JSON.parse(v) : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function salvarProgresso() {
    try { localStorage.setItem(CHAVE_PROG, JSON.stringify(progresso)); } catch (e) { /* modo privado */ }
  }

  function salvarPrefs() {
    try { localStorage.setItem(CHAVE_PREF, JSON.stringify(prefs)); } catch (e) { /* modo privado */ }
  }

  // Nivel de um cartao: 0 = nunca visto, 1..5 = Leitner. Ausente = 0.
  function nivelCartao(deckId, idx) {
    var d = progresso[deckId];
    return d && typeof d[idx] === "number" ? d[idx] : 0;
  }

  // Verdadeiro apenas se o cartao ja foi respondido alguma vez. Um cartao
  // errado volta ao nivel 0, mas continua sendo "ja visto" - por isso nao
  // basta consultar nivelCartao() para saber se a carta e nova.
  function jaVisto(deckId, idx) {
    var d = progresso[deckId];
    return !!(d && Object.prototype.hasOwnProperty.call(d, idx));
  }

  function marcar(deckId, idx, acertou) {
    var d = progresso[deckId] || (progresso[deckId] = {});
    var atual = typeof d[idx] === "number" ? d[idx] : 0;
    d[idx] = acertou ? Math.min(NIVEIS_MAX, atual + 1) : 0;
    salvarProgresso();
  }

  function resetarDeck(deckId) {
    delete progresso[deckId];
    salvarProgresso();
  }

  function statsDeck(deckId, total) {
    var d = progresso[deckId] || {};
    var vistas = 0, dominadas = 0;
    for (var k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      vistas++;
      if (d[k] >= NIVEL_MESTRE) dominadas++;
    }
    return {
      total: total,
      vistas: vistas,
      dominadas: dominadas,
      pctDominio: total ? Math.round((dominadas / total) * 100) : 0,
      pctVisto: total ? Math.round((vistas / total) * 100) : 0
    };
  }

  function statsGlobais() {
    var tot = 0, vistas = 0, dominadas = 0;
    for (var i = 0; i < catalogo.length; i++) {
      var ano = catalogo[i];
      for (var j = 0; j < ano.decks.length; j++) {
        var d = ano.decks[j];
        var s = statsDeck(d.id, d.n);
        tot += s.total; vistas += s.vistas; dominadas += s.dominadas;
      }
    }
    return {
      total: tot, vistas: vistas, dominadas: dominadas,
      pctDominio: tot ? Math.round((dominadas / tot) * 100) : 0
    };
  }

  /* ===================== Carga de decks (so sob demanda) ===================== */

  function varDe(deckId) {
    return "FC_DECK_" + deckId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  }

  function carregarDeck(deckId) {
    if (decksCarregados[deckId]) return Promise.resolve(decksCarregados[deckId]);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "data/decks/" + deckId + ".js";
      s.async = false;
      s.onload = function () {
        var deck = window[varDe(deckId)];
        if (deck) {
          decksCarregados[deckId] = deck;
          decksCarregados[deckId]._id = deckId;
          resolve(deck);
        } else {
          reject(new Error("Variavel " + varDe(deckId) + " nao encontrada em " + deckId + ".js"));
        }
      };
      s.onerror = function () {
        reject(new Error("Nao foi possivel carregar data/decks/" + deckId + ".js"));
      };
      document.head.appendChild(s);
    });
  }

  function carregarTodos() {
    var promessas = [];
    for (var i = 0; i < catalogo.length; i++) {
      var decks = catalogo[i].decks;
      for (var j = 0; j < decks.length; j++) promessas.push(carregarDeck(decks[j].id));
    }
    return Promise.all(promessas.map(function (p) { return p.catch(function () { return null; }); }));
  }

  /* ===================== Rotas ===================== */

  function irRota(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function lerRota() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var partes = h.split("?");
    var caminho = partes[0] || "";
    var query = {};
    (partes[1] || "").split("&").forEach(function (kv) {
      if (!kv) return;
      var p = kv.split("=");
      query[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
    });

    if (caminho.indexOf("deck/") === 0) {
      return { tipo: "deck", deckId: caminho.slice(5), idx: parseInt(query.i, 10) || 0 };
    }
    if (caminho === "busca") return { tipo: "busca", q: query.q || "" };
    if (caminho === "") return { tipo: "home" };
    return { tipo: "home" };
  }

  /* ===================== Utilidades de texto ===================== */

  // Remove acentos (mantem a caixa original ou nao, conforme pedido).
  var RE_MARCAS = /[\u0300-\u036f]/g;

  function semAcento(s) {
    return (s || "").normalize("NFD").replace(RE_MARCAS, "").toLowerCase();
  }

  function semAcentoStr(s) {
    return (s || "").normalize("NFD").replace(RE_MARCAS, "");
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Destaca o trecho procurado sem quebrar o HTML.
  // Realça o trecho procurado sem quebrar o HTML. A comparação ignora
  // acentos e maiúsculas, como a busca; os índices do texto normalizado são
  // mapeados de volta para as posições no texto original.
  // Aceita uma frase inteira ou varias palavras (cada uma é realçada).
  function realcar(texto, termo) {
    if (!termo) return esc(texto);
    var alvo = semAcento(texto);
    var termos = semAcento(termo).split(/\s+/).filter(function (p) { return p.length > 1; });
    if (!termos.length) termos = [semAcento(termo)];

    // Mapa de cada caractere do texto normalizado para o indice original.
    var mapa = [];
    for (var k = 0; k < texto.length; k++) {
      var d = semAcento(texto[k]);
      for (var j = 0; j < d.length; j++) mapa.push(k);
    }
    if (mapa.length !== alvo.length) return esc(texto);   // segurança

    // Coleta os intervalos [ini, fim) de cada ocorrencia, sem sobrepor.
    var marcas = [];
    termos.forEach(function (t) {
      var from = 0;
      for (;;) {
        var i = alvo.indexOf(t, from);
        if (i < 0) break;
        marcas.push([i, i + t.length]);
        from = i + t.length;
      }
    });
    if (!marcas.length) return esc(texto);
    marcas.sort(function (a, b) { return a[0] - b[0]; });

    var saida = "";
    var pos = 0;
    marcas.forEach(function (m) {
      if (m[0] < pos) return;                 // sobreposicao: ja foi pintada
      saida += esc(texto.slice(pos, m[0])) + "<mark>" + esc(texto.slice(m[0], m[1])) + "</mark>";
      pos = m[1];
    });
    return saida + esc(texto.slice(pos));
  }

  function baixarCSV(nomeArquivo, conteudo, mime) {
    var blob = new Blob(["﻿" + conteudo], { type: (mime || "text/csv") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvDoDeck(deck) {
    var linhas = ["Pergunta;Resposta"];
    for (var i = 0; i < deck.cards.length; i++) {
      linhas.push('"' + String(deck.cards[i][0]).replace(/"/g, '""') + '";"' +
                  String(deck.cards[i][1]).replace(/"/g, '""') + '"');
    }
    return linhas.join("\n");
  }

  /* ===================== Home ===================== */

  function renderHome(alvo) {
    alvo.innerHTML = "";

    var g = statsGlobais();

    var hero = el("section", "fc-hero");
    hero.innerHTML =
      '<h1>Flashcards da BNCC para o Ensino Fundamental e Médio</h1>' +
      '<p>Mais de <b>' + g.total.toLocaleString("pt-BR") + '</b> cartões de pergunta e resposta, ' +
      'organizados por série e por disciplina, alinhados à Base Nacional Comum Curricular. ' +
      'Estude no computador ou no celular, com repetição espaçada e progresso salvo no próprio aparelho.</p>';
    var stats = el("div", "stats");
    [
      ["Cartões", g.total.toLocaleString("pt-BR"), true],
      ["Séries", String(catalogo.length), false],
      ["Disciplinas", String(catalogo.reduce(function (a, x) { return a + x.decks.length; }, 0)), false],
      ["Dominados", g.dominadas.toLocaleString("pt-BR"), false]
    ].forEach(function (s) {
      var d = el("div", "stat" + (s[2] ? " destaque" : ""));
      d.appendChild(el("b", null, s[1]));
      d.appendChild(el("span", null, s[0]));
      stats.appendChild(d);
    });
    hero.appendChild(stats);
    alvo.appendChild(hero);

    // Barra de progresso global
    var pg = el("section", "progresso-globalo");
    var rot = el("div", "rot", "Seu progresso geral");
    var trilha = el("div", "trilha");
    var fill = el("i");
    fill.style.width = g.pctDominio + "%";
    trilha.appendChild(fill);
    pg.appendChild(rot);
    pg.appendChild(trilha);
    pg.appendChild(el("div", "pct", g.pctDominio + "%"));
    var btnZerar = el("button", "btn btn-neutro", "Zerar progresso");
    btnZerar.addEventListener("click", function () {
      abrirModal("Zerar todo o progresso?",
        "Isso apaga o que voce ja estudou em todos os baralhos deste navegador. Nao tem como desfazer.",
        function () { progresso = {}; salvarProgresso(); render(); });
    });
    pg.appendChild(btnZerar);
    alvo.appendChild(pg);

    // Cartoes de serie
    alvo.appendChild(capaSecao("Escolha sua série", "Cada série reúne as disciplinas estudadas naquele ano."));

    var grade = el("div", "grade-series");
    catalogo.forEach(function (ano) {
      var s = statsSerie(ano);
      var b = el("button", "cartao-serie");
      b.style.setProperty("--cor", ano.cor);
      b.setAttribute("aria-expanded", "false");

      var topo = el("div", "serie-topo");
      topo.appendChild(el("div", "serie-num", ano.icone));
      var textos = el("div");
      textos.appendChild(el("div", "serie-titulo", ano.completo));
      textos.appendChild(el("div", "serie-sub",
        ano.decks.length + " disciplinas · " + ano.n.toLocaleString("pt-BR") + " cartões"));
      topo.appendChild(textos);
      b.appendChild(topo);

      var meta = el("div", "serie-meta");
      meta.appendChild(el("span", "pill", "vistos " + s.vistas + "/" + s.total));
      var p = el("span", "pill" + (s.pctDominio >= 60 ? " ok" : s.pctDominio > 0 ? " bom" : ""),
        s.pctDominio + "% dominados");
      meta.appendChild(p);
      b.appendChild(meta);

      var tr = el("div", "mini-trilha");
      var f = el("i");
      f.style.width = s.pctDominio + "%";
      tr.appendChild(f);
      b.appendChild(tr);

      b.addEventListener("click", function () { alternarSerie(alvo, ano, b); });
      grade.appendChild(b);
    });
    alvo.appendChild(grade);

    // Painel inicial: instrucoes
    var painel = el("section", "painel-series");
    painel.style.marginTop = "26px";
    painel.innerHTML =
      "<header><h3>Como usar</h3></header>" +
      '<p style="color:var(--muted);font-size:14px;margin-bottom:14px">' +
      "<b>1.</b> Escolha a série e clique na disciplina para começar. " +
      "<b>2.</b> Vire o cartão e use <b>Não sei</b> ou <b>Sei</b>: o site espaça a repetição (Leitner), " +
      "voltando mais vezes o que você erra. " +
      "<b>3.</b> Use a busca para achar qualquer termo em todos os cartões. " +
      "<b>4.</b> O progresso fica salvo neste navegador.</p>" +
      '<div class="btns" style="display:flex;gap:9px;flex-wrap:wrap"></div>';
    var btns = $(".btns", painel);

    var b1 = el("button", "btn btn-primario", "Começar a estudar");
    b1.addEventListener("click", function () {
      var primeiro = catalogo[0] && catalogo[0].decks[0];
      if (primeiro) irRota("#/deck/" + primeiro.id);
    });
    btns.appendChild(b1);

    var b2 = el("a", "btn btn-neutro", "Como gerar PDF para imprimir");
    b2.href = LINK_GERADOR;
    b2.title = "Abre o Gerador de Flashcards, onde voce importa qualquer CSV da pasta csv/";
    btns.appendChild(b2);

    alvo.appendChild(painel);
  }

  function statsSerie(ano) {
    var t = 0, v = 0, d = 0;
    ano.decks.forEach(function (dk) {
      var s = statsDeck(dk.id, dk.n);
      t += s.total; v += s.vistas; d += s.dominadas;
    });
    return { total: t, vistas: v, dominadas: d, pctDominio: t ? Math.round((d / t) * 100) : 0 };
  }

  function capaSecao(titulo, sub) {
    var d = el("div", "rodape-secao");
    d.appendChild(el("h2", null, titulo));
    if (sub) d.appendChild(el("p", null, sub));
    return d;
  }

  function alternarSerie(alvo, ano, botao) {
    var existente = document.getElementById("painel-" + ano.id);
    var aberto = botao.getAttribute("aria-expanded") === "true";
    if (existente) {
      existente.remove();
      botao.setAttribute("aria-expanded", "false");
      return;
    }
    if (aberto) return;

    botao.setAttribute("aria-expanded", "true");
    var painel = el("section", "painel-series");
    painel.id = "painel-" + ano.id;
    painel.style.marginTop = "16px";

    var head = el("header");
    var t = el("h3", null, ano.completo);
    head.appendChild(t);
    var s = statsSerie(ano);
    head.appendChild(el("span", "contagem",
      s.dominadas + " de " + s.total + " cartões dominados (" + s.pctDominio + "%)"));
    painel.appendChild(head);

    var grade = el("div", "grade-materias");
    ano.decks.forEach(function (d) {
      var st = statsDeck(d.id, d.n);
      var c = el("button", "cartao-materia");
      c.style.setProperty("--cor", d.cor);

      var topo = el("div", "materia-topo");
      topo.appendChild(el("span", "materia-emoji", d.emoji));
      var textos = el("div");
      textos.appendChild(el("div", "materia-nome", d.materia));
      textos.appendChild(el("div", "materia-area", d.area));
      topo.appendChild(textos);
      c.appendChild(topo);

      var tr = el("div", "mini-trilha");
      var f = el("i");
      f.style.width = st.pctDominio + "%";
      tr.appendChild(f);
      c.appendChild(tr);

      var pe = el("div", "materia-pe");
      pe.appendChild(el("span", null, d.n + " cartões"));
      pe.appendChild(el("span", null,
        st.dominadas > 0 ? st.pctDominio + "% ok" : "não iniciado"));
      c.appendChild(pe);

      c.addEventListener("click", function () { irRota("#/deck/" + d.id); });
      grade.appendChild(c);
    });
    painel.appendChild(grade);
    alvo.appendChild(painel);
    painel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ===================== Jogador ===================== */

  function renderDeck(alvo, deckId, idxInicial) {
    alvo.innerHTML = "";
    alvo.appendChild(el("div", "carregando", "Carregando baralho…"));

    carregarDeck(deckId).then(function (deck) {
      estado.deckAtual = deck;
      estado.indice = 0;
      estado.virado = false;
      estado.filtro = "todos";
      estado.ordem = montarOrdem(deck, "todos");

      if (idxInicial > 0 && idxInicial < deck.cards.length) {
        var pos = estado.ordem.indexOf(idxInicial);
        if (pos >= 0) estado.indice = pos;
      }
      pintarJogador(alvo, deck);
    }).catch(function (err) {
      alvo.innerHTML = "";
      var box = el("div", "erro-carga");
      box.innerHTML = "Não foi possível carregar este baralho.<br><br>" +
        "<code>" + esc(err.message) + "</code><br><br>" +
        "Se você abriu o site com duplo clique, alguns navegadores bloqueiam a leitura dos dados. " +
        "Nesse caso rode um servidor local na pasta do projeto: " +
        "<code>python3 -m http.server</code> e acesse <code>http://localhost:8000</code>.";
      alvo.appendChild(box);
    });
  }

  function montarOrdem(deck, filtro) {
    var ord = [];
    for (var i = 0; i < deck.cards.length; i++) ord.push(i);
    if (filtro === "novas") ord = ord.filter(function (i) { return !jaVisto(deck.id, i); });
    else if (filtro === "revisao") ord = ord.filter(function (i) {
      return jaVisto(deck.id, i) && nivelCartao(deck.id, i) < NIVEL_MESTRE;
    });
    else if (filtro === "dominadas") ord = ord.filter(function (i) { return nivelCartao(deck.id, i) >= NIVEL_MESTRE; });
    // Espacamento Leitner: o que ainda nao foi dominaido vem primeiro.
    ord.sort(function (a, b) { return nivelCartao(deck.id, a) - nivelCartao(deck.id, b); });
    return ord;
  }

  function pintarJogador(alvo, deck) {
    alvo.innerHTML = "";
    var wrap = el("div", "jogador");
    wrap.style.setProperty("--cor", deck.cor);

    // Cabecalho
    var topo = el("div", "jogador-topo");
    var voltar = el("button", "btn btn-neutro", "← Todas as séries");
    voltar.addEventListener("click", function () { irRota("#/"); });
    topo.appendChild(voltar);

    var titulo = el("div");
    titulo.style.flex = "1";
    titulo.style.minWidth = "180px";
    var h = el("div", "serie-titulo", deck.emoji + "  " + deck.materia + " · " + deck.anoCurto);
    h.style.fontSize = "1.1rem";
    titulo.appendChild(h);
    titulo.appendChild(el("div", "serie-sub", deck.anoCompleto + " · " + deck.cards.length + " cartões"));
    topo.appendChild(titulo);

    var btnCsv = el("button", "btn btn-neutro", "CSV");
    btnCsv.title = "Baixar este baralho em CSV (para o Gerador de Flashcards)";
    btnCsv.addEventListener("click", function () {
      baixarCSV(deck.id + ".csv", csvDoDeck(deck));
    });
    topo.appendChild(btnCsv);

    var btnPrint = el("button", "btn btn-neutro", "Imprimir");
    btnPrint.addEventListener("click", function () { window.print(); });
    topo.appendChild(btnPrint);

    var btnReset = el("button", "btn btn-neutro", "Zerar");
    btnReset.title = "Reiniciar o progresso deste baralho";
    btnReset.addEventListener("click", function () {
      abrirModal("Zerar o progresso de " + deck.materia + "?",
        "Os " + deck.cards.length + " cartões deste baralho voltam para o nível zero.",
        function () { resetarDeck(deck.id); estado.ordem = montarOrdem(deck, estado.filtro); estado.indice = 0; pintarJogador(alvo, deck); });
    });
    topo.appendChild(btnReset);
    wrap.appendChild(topo);

    // Barra de progresso da sessao
    var barra = el("div", "barra-jogo");
    var info = el("div", "jogo-info");
    var esq = el("span", null, "");
    var dir = el("span", null, "");
    info.appendChild(esq); info.appendChild(dir);
    barra.appendChild(info);
    var trilha = el("div", "trilha");
    var fill = el("i");
    trilha.appendChild(fill);
    barra.appendChild(trilha);
    wrap.appendChild(barra);

    // Filtros
    var filtros = el("div", "filtros-jogo");
    [
      ["todos", "Todos"],
      ["novas", "Só novas"],
      ["revisao", "Para revisar"],
      ["dominadas", "Dominadas"]
    ].forEach(function (f) {
      var c = el("button", "chip", f[1]);
      c.setAttribute("aria-pressed", String(estado.filtro === f[0]));
      c.addEventListener("click", function () {
        estado.filtro = f[0];
        estado.ordem = montarOrdem(deck, f[0]);
        estado.indice = 0;
        estado.virado = false;
        pintarJogador(alvo, deck);
      });
      filtros.appendChild(c);
    });
    var contador = el("span", "pill", "");
    filtros.appendChild(contador);
    wrap.appendChild(filtros);

    // Cartao 3D
    var caixa = el("div", "cartao3d");
    var inner = el("div", "cartao3d-inner");
    inner.setAttribute("tabindex", "0");
    inner.setAttribute("role", "button");
    inner.setAttribute("aria-label", "Virar o cartão (Enter ou Espaço)");

    var frente = el("div", "cara cara-frente");
    var verso = el("div", "cara cara-verso");
    frente.appendChild(el("span", "cara-tag", "Pergunta"));
    verso.appendChild(el("span", "cara-tag", "Resposta"));
    var txtF = el("div", "cara-texto");
    var txtB = el("div", "cara-texto");
    frente.appendChild(txtF);
    verso.appendChild(txtB);
    var nivel = el("span", "nivel-badge", "");
    frente.appendChild(nivel);
    frente.appendChild(el("span", "cara-dica", "Clique ou aperte Espaço para ver a resposta"));
    verso.appendChild(el("span", "cara-dica", "Clique para voltar à pergunta"));
    inner.appendChild(frente);
    inner.appendChild(verso);
    caixa.appendChild(inner);
    wrap.appendChild(caixa);

    inner.addEventListener("click", function () { virar(); });
    inner.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); virar(); }
    });

    function virar() {
      estado.virado = !estado.virado;
      caixa.classList.toggle("virada", estado.virado);
    }

    // Controles
    var ctrl = el("div", "controles");
    var bAnt = el("button", "btn btn-neutro", "← Anterior");
    var bNao = el("button", "btn btn-bad", "✕ Não sei");
    var bSei = el("button", "btn btn-ok", "✓ Sei");
    var bProx = el("button", "btn btn-primario", "Próximo →");
    var bShuf = el("button", "btn btn-neutro", "🔀 Embaralhar");
    ctrl.appendChild(bAnt); ctrl.appendChild(bNao); ctrl.appendChild(bSei);
    ctrl.appendChild(bProx); ctrl.appendChild(bShuf);
    wrap.appendChild(ctrl);

    bAnt.addEventListener("click", function () { mover(-1); });
    bProx.addEventListener("click", function () { mover(1); });
    bNao.addEventListener("click", function () { responder(false); });
    bSei.addEventListener("click", function () { responder(true); });
    bShuf.addEventListener("click", function () {
      for (var k = estado.ordem.length - 1; k > 0; k--) {
        var j = Math.floor(Math.random() * (k + 1));
        var t = estado.ordem[k]; estado.ordem[k] = estado.ordem[j]; estado.ordem[j] = t;
      }
      estado.indice = 0;
      estado.virado = false;
      pintarJogador(alvo, deck);
    });

    function responder(acertou) {
      var real = estado.ordem[estado.indice];
      marcar(deck.id, real, acertou);
      // Avanca mantendo o filtro: se for "só novas" e a carta deixa de ser nova,
      // ela sai da lista. Reordenar mantem o foco no que falta.
      estado.ordem = montarOrdem(deck, estado.filtro);
      if (!estado.ordem.length) {
        pintarJogador(alvo, deck);
        return;
      }
      if (estado.indice >= estado.ordem.length) estado.indice = estado.ordem.length - 1;
      estado.virado = false;
      pintarJogador(alvo, deck);
    }

    function mover(d) {
      if (!estado.ordem.length) return;
      estado.indice = (estado.indice + d + estado.ordem.length) % estado.ordem.length;
      estado.virado = false;
      pintarJogador(alvo, deck);
    }

    // Atalhos globais dentro do jogador
    docTeclas.handler = function (e) {
      if (document.querySelector(".cartao3d") === null) return;
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowRight") { e.preventDefault(); mover(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); mover(-1); }
      else if (e.key === "1") { responder(false); }
      else if (e.key === "2") { responder(true); }
      else if (e.key === " " || e.key === "Enter") {
        if (document.activeElement !== inner) { e.preventDefault(); virar(); }
      }
    };

    // Pintar o estado atual
    function pintar() {
      var total = estado.ordem.length;
      if (!total) {
        caixa.style.display = "none";
        ctrl.style.display = "none";
        esq.textContent = "";
        dir.textContent = "";
        contador.textContent = "nenhum cartão neste filtro";
        contador.className = "pill";
        var v = el("div", "vazio");
        v.innerHTML = '<span class="big">✓</span><b>Tudo certo!</b><br>' +
          "Não há cartões neste filtro. Escolha outro filtro ou zere o baralho para revisar tudo.";        wrap.appendChild(v);
        return;
      }
      var pos = estado.ordem[estado.indice];
      var c = deck.cards[pos];
      txtF.textContent = c[0];
      txtB.textContent = c[1];
      var nv = nivelCartao(deck.id, pos);
      nivel.textContent = "nível " + nv + "/" + NIVEIS_MAX;
      nivel.style.color = nv >= NIVEL_MESTRE ? "var(--ok)" : nv > 0 ? "var(--warn)" : "var(--muted)";

      esq.textContent = "Cartão " + (estado.indice + 1) + " de " + total + " · " + pos + " do baralho";
      var s = statsDeck(deck.id, deck.cards.length);
      dir.textContent = s.dominadas + "/" + s.total + " dominados";
      fill.style.width = ((estado.indice + 1) / total) * 100 + "%";

      contador.textContent = deck.cards.length + " no baralho · " +
        s.vistas + " vistos · " + s.pctDominio + "% dominados";
    }
    pintar();

    var atalhos = el("div", "atalhos");
    atalhos.innerHTML = "Atalhos: <kbd>←</kbd><kbd>→</kbd> navegar · " +
      "<kbd>Espaço</kbd> virar · <kbd>1</kbd> não sei · <kbd>2</kbd> sei";
    wrap.appendChild(atalhos);
    alvo.appendChild(wrap);
  }

  /* ===================== Busca global ===================== */

  function renderBusca(alvo, termo) {
    alvo.innerHTML = "";
    var box = el("div");
    box.appendChild(capaSecao("Busca", termo ? "Resultados para “" + termo + "”" : "Digite acima para pesquisar em todos os cartões."));
    var corpo = el("div");
    box.appendChild(corpo);
    alvo.appendChild(box);

    if (!termo || termo.length < 2) {
      var v = el("div", "vazio");
      v.innerHTML = '<span class="big">⌕</span>Escreva pelo menos 2 letras para buscar nos ' +
        statsGlobais().total.toLocaleString("pt-BR") + " cartões.";
      corpo.appendChild(v);
      return;
    }

    corpo.appendChild(el("div", "carregando", "Procurando em todos os baralhos…"));

    // Uma palavra: busca direta. Varias palavras: TODAS precisam aparecer
    // (as palavras na ordem do enunciado nao aparecem no texto).
    var palavras = semAcento(termo).split(/\s+/).filter(function (p) { return p.length > 1; });
    if (!palavras.length) palavras = [semAcento(termo)];
    var achados = [];

    function casa(alvoNorm) {
      for (var p = 0; p < palavras.length; p++) {
        if (alvoNorm.indexOf(palavras[p]) < 0) return false;
      }
      return true;
    }

    carregarTodos().then(function () {
      for (var i = 0; i < catalogo.length; i++) {
        var ano = catalogo[i];
        for (var j = 0; j < ano.decks.length; j++) {
          var d = decksCarregados[ano.decks[j].id];
          if (!d) continue;
          for (var k = 0; k < d.cards.length; k++) {
            var nq = semAcento(d.cards[k][0]);
            var na = semAcento(d.cards[k][1]);
            var pQ = casa(nq), pA = casa(na);
            if (pQ || pA) achados.push({ deck: d, idx: k, pQ: pQ, pA: pA });
          }
        }
      }
      corpo.innerHTML = "";
      if (!achados.length) {
        var v2 = el("div", "vazio");
        v2.innerHTML = '<span class="big">∅</span>Nenhum cartão encontrado para “' + esc(termo) + '”.';
        corpo.appendChild(v2);
        return;
      }
      var info = el("p", null, achados.length + " resultado(s). A busca ignora acentos.");
      info.style.color = "var(--muted)";
      info.style.fontSize = "13.5px";
      info.style.marginBottom = "12px";
      corpo.appendChild(info);

      var lista = el("div", "resultados");
      achados.slice(0, 400).forEach(function (r) {
        var b = el("button", "resultado");
        // realcar() devolve HTML (com <mark>); esc() devolve texto seguro.
        //Por isso vao por innerHTML, e nao por textContent.
        var dq = el("div", "rq");
        dq.innerHTML = r.pQ ? realcar(r.deck.cards[r.idx][0], termo) : esc(r.deck.cards[r.idx][0]);
        b.appendChild(dq);
        var da = el("div", "ra");
        da.innerHTML = r.pA ? realcar(r.deck.cards[r.idx][1], termo) : esc(r.deck.cards[r.idx][1]);
        b.appendChild(da);
        var m = el("div", "rm");
        m.appendChild(el("span", "pill", r.deck.emoji + " " + r.deck.materia));
        m.appendChild(el("span", null, r.deck.anoCurto + " · abrir no baralho"));
        b.appendChild(m);
        b.addEventListener("click", function () { irRota("#/deck/" + r.deck.id + "?i=" + r.idx); });
        lista.appendChild(b);
      });
      corpo.appendChild(el("span", "sr", "Fim dos resultados"));
      corpo.appendChild(lista);
      if (achados.length > 400) {
        var aviso = el("p", null, "Mostrando os 400 primeiros de " + achados.length + ". Refine a busca.");
        aviso.style.color = "var(--muted)";
        aviso.style.fontSize = "13px";
        aviso.style.marginTop = "12px";
        corpo.appendChild(aviso);
      }
    });
  }

  /* ===================== Modal ===================== */

  function abrirModal(titulo, texto, aoConfirmar) {
    var fundo = $("#modal-fundo");
    var t = $("#modal-titulo");
    var p = $("#modal-texto");
    t.textContent = titulo;
    p.textContent = texto;
    fundo.classList.add("aberto");
    var sim = $("#modal-confirmar");
    var nao = $("#modal-cancelar");
    function fechar() { fundo.classList.remove("aberto"); sim.onclick = null; nao.onclick = null; }
    sim.onclick = function () { fechar(); aoConfirmar(); };
    nao.onclick = fechar;
    fundo.onclick = function (e) { if (e.target === fundo) fechar(); };
    nao.focus();
  }

  /* ===================== Render e boot ===================== */

  var docTeclas = { handler: null, handlerAtivo: false };

  function render() {
    var alvo = $("#app");
    var rota = lerRota();
    estado.rota = rota;

    // Atalho de teclado so na rota do jogador
    document.onkeydown = rota.tipo === "deck"
      ? function (e) { if (docTeclas.handler) docTeclas.handler(e); }
      : null;

    window.scrollTo(0, 0);

    if (rota.tipo === "deck") renderDeck(alvo, rota.deckId, rota.idx);
    else if (rota.tipo === "busca") renderBusca(alvo, rota.q);
    else renderHome(alvo);
  }

  // Monta o indice id -> metadados
  catalogo.forEach(function (ano) {
    ano.decks.forEach(function (d) { indiceDecks[d.id] = d; });
  });

  // Liga um elemento apenas se ele existir na pagina. O app roda tanto no
  // repositorio quanto embutido no site, e cada versao tem um conjunto
  // proprio de controles na barra superior.
  function ligar(sel, evento, fn) {
    var alvo = $(sel);
    if (alvo) alvo.addEventListener(evento, fn);
  }

  // Barra superior
  var inputBusca = $("#busca-input");
  var temporizador = null;
  function irParaBusca() {
    if (!inputBusca) return;
    var v = inputBusca.value.trim();
    if (v.length >= 2) irRota("#/busca?q=" + encodeURIComponent(v));
  }
  ligar("#busca-input", "input", function () {
    clearTimeout(temporizador);
    temporizador = setTimeout(irParaBusca, 350);
  });
  ligar("#busca-input", "keydown", function (e) {
    if (e.key === "Enter") irParaBusca();
  });

  ligar("#tema-btn", "click", function () {
    prefs.tema = prefs.tema === "escuro" ? "claro" : "escuro";
    salvarPrefs();
    aplicarTema();
  });

  ligar("#inicio-btn", "click", function () { irRota("#/"); });
  ligar("#csv-btn", "click", function () { window.location.href = "csv/"; });

  function aplicarTema() {
    document.documentElement.setAttribute("data-tema", prefs.tema);
    var b = $("#tema-btn");
    if (!b) return;
    b.textContent = prefs.tema === "escuro" ? "☀" : "☾";
    b.setAttribute("aria-label", prefs.tema === "escuro" ? "Mudar para tema claro" : "Mudar para tema escuro");
  }

  ligar("#modal-cancelar", "click", function () {
    var f = $("#modal-fundo");
    if (f) f.classList.remove("aberto");
  });

  window.addEventListener("hashchange", render);
  window.addEventListener("keydown", function (e) {
    if (inputBusca && e.key === "/" && document.activeElement !== inputBusca) {
      e.preventDefault();
      inputBusca.focus();
    }
  });

  aplicarTema();
  render();

  if (!catalogo.length) {
    var alvo = $("#app");
    if (alvo) {
      alvo.innerHTML =
        '<div class="erro-carga">O catálogo não carregou. Rode <code>python3 ferramentas/gerar_site.py</code> ' +
        "e recarregue a página.</div>";
    }
  }
})();
