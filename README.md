# Sona — Música sem fronteiras

Plataforma de streaming de música com duas áreas:

- **Cliente** (`/`) — onde as pessoas ouvem: home com destaque, biblioteca,
  busca, artistas, álbuns, playlists, curtidas, player global e tela de
  reprodução com letra sincronizada.
- **Sona Studio** (`/studio`) — onde o catálogo é alimentado: upload de faixas,
  gestão de artistas, editor de letras sincronizadas, curadoria de playlists,
  destaques da home e um dashboard de métricas.

## Rodando

```bash
npm install
npm run dev       # http://localhost:3000
```

A biblioteca começa **vazia**. Abra `/studio/upload`, envie um arquivo de áudio
e a faixa aparece imediatamente para os ouvintes.

Outros comandos:

```bash
npm run build && npm start   # produção
npm run lint                 # eslint
npx tsc --noEmit             # type-check
```

## Como funciona

### Dados

O catálogo vive em `data/sona.json`, e os arquivos enviados em
`public/uploads/{audio,covers}/`. Não há banco nem serviço externo — o objetivo
é rodar localmente sem configuração.

- `src/lib/db.ts` — leitura, escrita atômica (grava num temporário e renomeia) e
  uma fila que serializa mutações, para dois uploads simultâneos não se
  sobrescreverem.
- `src/lib/storage.ts` — grava os uploads, valida tamanho, extensão **e a
  assinatura real do arquivo** (um `.txt` renomeado para `.mp3` é recusado), e lê
  a duração da faixa dos metadados.
- `src/lib/actions.ts` — todas as Server Actions. Cada uma revalida `/` em modo
  layout, então o que o Studio muda o cliente vê na navegação seguinte.

`readDb()` chama `connection()` do Next: sem isso as páginas seriam
pré-renderizadas no build e os ouvintes veriam um catálogo congelado no momento
do deploy.

### Player

`src/components/client/PlayerProvider.tsx` mantém um único elemento `Audio` fora
do DOM e expõe fila, shuffle, repeat, volume e curtidas por contexto. Uma
reprodução é contabilizada após 5 segundos de escuta (ou 30% da faixa), o que
alimenta o gráfico do dashboard. Também registra Media Session, então os
controles de mídia do sistema operacional funcionam.

Atalhos: `Espaço` toca/pausa, `Shift+→` e `Shift+←` trocam de faixa. Eles são
ignorados enquanto se digita num campo.

### Letras sincronizadas

Em `/studio/letras` você cola a letra inteira (uma linha por verso) ou adiciona
verso a verso. Com a faixa tocando no player lateral, "Marcar" carimba o tempo
atual no verso — e o cursor pula para o próximo, então dá para sincronizar uma
música inteira ouvindo uma vez. O formato `[0:12] verso` também é reconhecido na
importação. No cliente, o verso ativo acende e clicar num verso pula para ele.

### Design

Os tokens saíram das imagens de referência e estão em `src/app/globals.css`:
superfícies (`sidebar` mais escura que `canvas`), três níveis de texto e o verde
`#1dd760` reservado ao CTA principal e ao estado "tocando".

O wordmark em `src/components/Brand.tsx` é um SVG traçado a partir das medidas da
logo original — os glifos foram amostrados pixel a pixel para acertar a
espessura das hastes, o "O" circular e o "A" sem travessão.

Capas e fotos ausentes caem num gradiente determinístico com as iniciais, para a
grade nunca ter buracos cinzas.

Todas as páginas passam auditoria axe-core em WCAG 2 A/AA sem violações.

## Estrutura

```
src/
  app/
    (client)/          páginas do ouvinte
    studio/            páginas de quem alimenta o catálogo
  components/
    client/            shell, player, cards, tela de reprodução
    studio/            formulários, tabelas, editor de letras, gráfico
    Brand, Cover, Icons
  lib/
    types, db, storage, actions, utils
data/sona.json         catálogo (criado no primeiro uso)
public/uploads/        áudio e imagens enviados
```

## Limites conhecidos

- Usuário único: as curtidas são globais, não por conta. Não há autenticação — o
  Studio é aberto a quem tem a URL, o que é adequado para uso local mas precisa
  de login antes de ir para produção.
- O armazenamento em arquivo serve bem a um catálogo pequeno; para escalar,
  `src/lib/db.ts` é a única camada a trocar por um banco de verdade.
- Uploads ficam em `public/`, servidos diretamente pelo Next. Em produção o
  natural seria object storage com CDN.
