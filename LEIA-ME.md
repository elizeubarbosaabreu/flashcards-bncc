# Flashcards da BNCC — site de estudos da Educação Básica

**2.779 cartões** de pergunta e resposta, alinhados à Base Nacional Comum Curricular,
organizados por série e por disciplina, com repetição espaçada e progresso salvo
no próprio navegador. Tudo funciona offline, sem servidor e sem cadastro.

| Série | Disciplinas | Cartões |
|---|---|---|
| 6º ano do Ensino Fundamental | 8 | 352 |
| 7º ano do Ensino Fundamental | 8 | 352 |
| 8º ano do Ensino Fundamental | 8 | 358 |
| 9º ano do Ensino Fundamental | 8 | 352 |
| 1º ano do Ensino Médio | 12 | 455 |
| 2º ano do Ensino Médio | 12 | 455 |
| 3º ano do Ensino Médio | 12 | 455 |

**Fundamental:** Matemática, Língua Portuguesa, Língua Inglesa, Ciências,
História, Geografia, Arte, Educação Física.
**Médio:** as oito acima mais Física, Química, Biologia, Filosofia e Sociologia.

## Como usar

Abra o `index.html` no navegador. Se preferir servir por HTTP:

```bash
cd estudo-flashcards-bncc
python3 -m http.server 8000
# depois acesse http://localhost:8000
```

### No site

- **Escolha a série** e clique na disciplina para começar a estudar.
- **Vire o cartão** com clique ou `Espaço`; navegue com `←` e `→`.
- **Não sei / Sei** (`1` e `2`) alimentam o sistema de repetição espaçada (Leitner):
  o que você acerta aparece cada vez menos, e o que você erra volta mais vezes.
  Um cartão conta como *dominado* no nível 4 de 5.
- **Filtros** por *Só novas*, *Para revisar* e *Dominadas*.
- **Busca** (`/` para focar) procura em todos os 2.779 cartões ao mesmo tempo,
  ignorando acentos e maiúsculas. Com várias palavras, exige que **todas** apareçam.
  Clicar no resultado abre o cartão na sua disciplina.
- O progresso fica no `localStorage`. **Zerar progresso** limpa tudo.

## Gerar PDF para imprimir

Os 68 arquivos em `csv/` estão no formato do
[Gerador de Flashcards](https://elizeubarbosa.com.br/ferramentas/gerador-flashcards.html):
duas colunas (`Pergunta` e `Resposta`), separador ponto e vírgula, primeira linha de cabeçalho.
Os 68/68 foram conferidos contra o parser da ferramenta.

1. Baixe o CSV em `csv/index.html` (ou clique em **CSV** dentro de um baralho do site).
2. No Gerador de Flashcards, abra **Importar de CSV** e arraste o arquivo.
3. Deixe o separador em **Detectar** e marque **Primeira linha é cabeçalho**.
4. Escolha 4, 6 ou 12 cartões por folha e baixe o PDF.

Para juntar vários arquivos, marque **Adicionar aos existentes** antes de importar o próximo.

## Estrutura

```
index.html              site de estudos (hub, busca e jogador)
assets/style.css        estilos
assets/app.js           hub, jogador, busca e progresso
csv/                    68 CSVs prontos para o Gerador de Flashcards
  index.html            catálogo dos CSVs, com download
data/catalog.js         metadados dos baralhos (gerado)
data/decks/*.js         um arquivo por baralho, carregado sob demanda (gerado)
ferramentas/            scripts de manutenção
  validar_csv.py        confere formato, duplicatas e texto corrompido
  gerar_site.py         converte csv/ em data/
  gerar_indice_csv.py   gera csv/index.html
```

## Editar os cartões

Os CSVs em `csv/` são a fonte. Para mudar um cartão, edite o CSV e regenere:

```bash
python3 ferramentas/validar_csv.py      # checa antes de gerar
python3 ferramentas/gerar_site.py       # atualiza data/
python3 ferramentas/gerar_indice_csv.py # atualiza csv/index.html
```

`validar_csv.py` detecta cabeçalho errado, colunas faltando, perguntas duplicadas
(por arquivo e entre disciplinas do mesmo ano) e texto corrompido de geração —
caracteres CJK, substitutions, blocos de pontuação sem sentido.

Formato de cada linha:

```csv
"Qual é a fórmula de Bhaskara?";"x = (-b ± √(b² - 4ac)) / 2a"
```

## Observações

- O conteúdo segue a BNCC e o currículo usual, com perfil de revisão e preparação
  para o ENEM no 3º ano do Médio. É material de estudo, não substitui o livro
  didático nem a aula do professor.
- As respostas foram escritas para caber em um cartão: curtas e diretas.
  Fórmulas, equações e nomes próprios aparecem em texto simples para evitar
  problemas de fonte na impressão.
- Nenhum dado é enviado para servidores; tudo roda no navegador.
