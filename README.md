# API LOL Matchup Analyzer

Aplicacao para analisar matchups de Top Lane no League of Legends usando a Riot API.

O projeto hoje tem duas partes principais:

- `backend/`: API Node.js + Express que consulta a Riot API, busca partidas recentes, filtra matchups exatos na top lane e calcula metricas avancadas.
- `frontend-app/`: interface Angular para pesquisar jogadores e visualizar o resumo das partidas encontradas.

## O que a aplicacao faz

Dado um jogador e um matchup exato, por exemplo `Aatrox vs Ornn`, a API:

- localiza a conta pelo `gameName` e `tagLine`
- busca partidas recentes do jogador
- filtra apenas partidas `CLASSIC` no mapa padrao
- encontra partidas onde o jogador estava na `TOP` e enfrentou exatamente o campeao informado na top lane
- carrega a timeline detalhada da partida
- calcula:
  - winrate isolado do matchup
  - `gold diff`, `cs diff` e `xp diff` aos 10 e 15 minutos
  - probabilidade de gank inimigo no topo nos primeiros 10 minutos
  - build, runas e resumo de combate da partida

## Estrutura do projeto

```txt
.
├── backend/
├── frontend/
├── frontend-app/
├── PROJECT_STRUCTURE.md
└── README.md
```

Observacao:

- `frontend-app/` e o frontend executavel atual.
- `frontend/` ficou como referencia dos arquivos Angular originais que existiam no projeto.

## Requisitos

- Node.js 20+ ou superior
- npm
- uma chave valida da Riot API

## Como conseguir a Riot API Key

1. Entre em [https://developer.riotgames.com/](https://developer.riotgames.com/)
2. Faça login com sua conta Riot
3. Gere uma `development key`
4. Coloque essa chave no arquivo `.env`

Importante:

- a `development key` normalmente expira em 24 horas
- se a API responder `Unknown apikey`, gere uma chave nova

## Configuracao do backend

Entre na pasta do backend:

```powershell
cd "C:\Users\jpcic\Desktop\API-LOL-main\backend"
```

Instale as dependencias:

```powershell
npm install
```

Crie o arquivo `.env` usando o modelo de `backend/.env.example`.

Exemplo:

```env
PORT=3000
NODE_ENV=development
RIOT_API_KEY=RGAPI-sua-chave-aqui
RIOT_REGION=americas
RIOT_PLATFORM=br1
REQUEST_TIMEOUT_MS=12000
MAX_RETRIES=5
BASE_BACKOFF_MS=750
MAX_QUEUE_CONCURRENCY=2
```

Suba o backend:

```powershell
npm start
```

Teste rapido:

```powershell
Invoke-RestMethod "http://localhost:3000/health"
```

## Configuracao do frontend

Entre na pasta do app Angular:

```powershell
cd "C:\Users\jpcic\Desktop\API-LOL-main\frontend-app"
```

Instale as dependencias:

```powershell
npm install
```

Suba o frontend:

```powershell
npm start
```

Abra no navegador:

```txt
http://localhost:4200
```

## Rodando tudo localmente

Use duas janelas do PowerShell.

Janela 1:

```powershell
cd "C:\Users\jpcic\Desktop\API-LOL-main\backend"
npm start
```

Janela 2:

```powershell
cd "C:\Users\jpcic\Desktop\API-LOL-main\frontend-app"
npm start
```

Depois acesse:

```txt
http://localhost:4200
```

## Como usar

No frontend, preencha:

- `Game Name`
- `Tag Line`
- `Seu campeao`
- `Matchup`

Exemplo:

- `Game Name`: `FullStack Java`
- `Tag Line`: `DEV`
- `Seu campeao`: `Aatrox`
- `Matchup`: `Ornn`

A interface mostra:

- quantidade de partidas encontradas
- winrate do matchup
- tempo da consulta
- numero de partidas vasculhadas
- cards com informacoes detalhadas de cada partida encontrada

## Endpoint principal

```http
GET /api/matchup/analyze
```

Parametros:

- `gameName`
- `tagLine`
- `championA`
- `championB`

Exemplo:

```txt
http://localhost:3000/api/matchup/analyze?gameName=FullStack%20Java&tagLine=DEV&championA=Aatrox&championB=Ornn
```

## O que ja foi implementado

- backend Express integrado com Riot API
- busca de conta via Account API e Summoner-V4
- busca de historico via Match-V5
- leitura detalhada frame a frame via Match-Timeline-V5
- filtro de matchup exato na top lane
- calculo de:
  - winrate do matchup
  - gold diff, cs diff e xp diff aos 10 e 15 minutos
  - presenca do jungler inimigo em eventos relevantes da top lane
  - build e runas do jogador na partida
- cache em memoria para acelerar consultas repetidas
- frontend Angular para testes locais

## Limitacoes atuais

- a Riot API de desenvolvimento tem rate limit baixo
- consultas muito amplas podem demorar mais na primeira execucao
- a interface ainda nao faz mapeamento visual de itens e runas com icones e nomes amigaveis como sites tipo OP.GG
- a pasta `frontend/` antiga nao e a interface principal atual

## Dicas de uso

- repita a mesma consulta uma segunda vez para aproveitar a cache local
- se uma partida nao aparecer, teste outro matchup que voce jogou recentemente
- se o backend reclamar que a porta `3000` esta ocupada, provavelmente ele ja esta rodando em outra janela

Para encerrar um backend ja rodando na porta `3000`:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

## Git e arquivos ignorados

O projeto usa `.gitignore` para nao versionar:

- `.env`
- `node_modules`
- `dist`
- `.angular`
- logs temporarios

## Proximos passos

- mapear IDs de itens e runas para nomes e icones
- criar tela de detalhes por partida
- separar melhor frontend antigo e frontend atual
- adicionar testes automatizados para os calculos da timeline
