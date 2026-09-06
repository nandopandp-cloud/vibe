# Sona — Música sem fronteiras

Plataforma de streaming de música com duas áreas:

- **Cliente** (`/`) — onde as pessoas ouvem: home com destaque, biblioteca,
  busca, artistas, álbuns, playlists, curtidas, player global e tela de
  reprodução com letra sincronizada.
- **Sona Studio** (`/studio`) — onde o catálogo é alimentado: publicação de
  faixas avulsas ou de álbuns inteiros, gestão de artistas, editor de letras
  sincronizadas, curadoria de playlists, destaques da home e um dashboard de
  métricas.

## Rodando

```bash
npm install
vercel link              # conecta ao projeto na Vercel
vercel env pull .env.local   # traz Postgres e Blob
npm run dev              # http://localhost:3000
```

O `.env.local` precisa de `DATABASE_URL` (Postgres) e `BLOB_READ_WRITE_TOKEN`
(Vercel Blob); em produção defina também `SONA_SESSION_SECRET`.

### Acesso

A plataforma exige login. As contas de demonstração são criadas na primeira
execução (o bloco que as exibe na tela de login está marcado para remoção
antes de ir ao ar):

| Papel | E-mail | Senha |
| --- | --- | --- |
| Administrador (`admins`) | admins@gmail.com | 12345 |
| Ouvinte (`user`) | nandopandp@gmail.com | 12345 |

Quem tem papel `admins` acessa o Studio e alimenta o catálogo; `user` só
consome. Contas criadas pelo cadastro público entram sempre como ouvintes.

Outros comandos:

```bash
npm run build && npm start   # produção
npm run lint                 # eslint
npx tsc --noEmit             # type-check
```

## Como funciona

### Dados

Postgres (Neon, via Vercel) para o catálogo e as contas; Vercel Blob para áudio
e imagens. O disco do servidor é efêmero em produção, então nada é gravado nele.

- `src/lib/db.ts` — o catálogo é um documento JSONB numa linha só (ele é sempre
  lido inteiro para montar as telas, então uma consulta basta); usuários e
  curtidas ficam em tabelas próprias, que precisam de unicidade por e-mail e de
  chave estrangeira. `mutate()` mantém a mesma interface da versão em arquivo:
  o callback muta o objeto e a função grava o que mudou.
- `src/app/api/upload/route.ts` — assina tokens para o navegador enviar
  arquivos **direto ao Blob**. Server Actions têm teto de 4,5 MB de body na
  Vercel, o que reprovava qualquer música de duração normal com um 413. A rota
  confere o papel de admin antes de assinar, senão seria um upload aberto.
- `src/lib/upload-client.ts` — envio com progresso, leitura da duração e a
  checagem da assinatura real do arquivo (um `.txt` renomeado para `.mp3` é
  recusado), agora no navegador, já que o arquivo não passa pelo servidor.
- `src/lib/storage.ts` — usado nas telas que ainda enviam pelo servidor
  (fotos de artista, capas de playlist), com as mesmas validações.
- `src/lib/actions.ts` — todas as Server Actions. Cada uma revalida `/` em modo
  layout, então o que o Studio muda o cliente vê na navegação seguinte. As de
  catálogo verificam o papel de admin no servidor.
- `scripts/migrate-to-cloud.mjs` — leva um `data/sona.json` antigo para a nuvem.

`readDb()` chama `connection()` do Next: sem isso as páginas seriam
pré-renderizadas no build e os ouvintes veriam um catálogo congelado no momento
do deploy.

### Autenticação

Senhas com `scrypt` e salt por usuário. A sessão é um cookie httpOnly assinado
com HMAC-SHA256 (30 dias), verificado em tempo constante. `src/proxy.ts` barra
quem não tem cookie antes da página renderizar; a validação da assinatura
acontece no servidor, em `currentUser()`.

O papel de admin é verificado **dentro de cada Server Action** do Studio, não
apenas no redirect da UI — Server Actions são endpoints HTTP públicos. Isso foi
verificado reproduzindo a action de exclusão com uma sessão de ouvinte: o
servidor recusa e o catálogo não muda.

### Player

`src/components/client/PlayerProvider.tsx` mantém um único elemento `Audio` fora
do DOM e expõe fila, shuffle, repeat, volume e curtidas por contexto. Uma
reprodução é contabilizada após 5 segundos de escuta (ou 30% da faixa), o que
alimenta o gráfico do dashboard. Também registra Media Session, então os
controles de mídia do sistema operacional funcionam.

Atalhos: `Espaço` toca/pausa, `Shift+→` e `Shift+←` trocam de faixa. Eles são
ignorados enquanto se digita num campo.

### Publicando

`/studio/upload` publica uma faixa avulsa. `/studio/album` publica um disco
inteiro: escolha vários arquivos de uma vez, eles sobem em paralelo com barra
de progresso, os títulos são extraídos do nome (`03 - Titulo.mp3` vira
"Titulo") e a ordem pode ser ajustada antes de publicar. As faixas herdam a
capa do álbum.

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
    auth/              telas de login e cadastro
  lib/
    types, db, storage, actions, auth, auth-actions, utils
  proxy.ts             barra rotas sem sessão
scripts/
  migrate-to-cloud.mjs migração do formato antigo em arquivo
```

O catálogo e as contas ficam no Postgres; áudio e imagens, no Vercel Blob.

## Limites conhecidos

- Não há recuperação de senha: o link "Esqueceu sua senha?" ainda não faz nada,
  porque depende de um serviço de e-mail.
- Os botões de login social (Google/Apple/Spotify) aparecem desabilitados: não
  há OAuth configurado, e preferi deixá-los inertes a simular um login.
- Promover alguém a administrador exige alterar o papel direto no banco — não há
  tela de gestão de usuários.
- O catálogo é um documento JSONB único: ótimo para o volume atual, já que toda
  tela lê o acervo inteiro. Passando de alguns milhares de faixas, vale
  normalizar em tabelas próprias.
- O bloco de contas de demonstração na tela de login precisa sair antes de um
  uso real.
