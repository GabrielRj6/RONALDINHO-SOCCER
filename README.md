# RONALDINHO SOCCER

Futebol experimental de navegador, multiplayer online de até 10 jogadores, sem instalar nada.
Feito com canvas 2D puro e WebRTC (PeerJS) — hospedagem 100% estática.

## Jogar

Abra o site no navegador. No menu:

- **TREINO** — joga na hora contra bots (3x3).
- **CRIAR SALA** — abre uma sala e mostra um código de 5 caracteres. Mande o link + código pra galera.
- **ENTRAR** — digite o código de uma sala e entre.

Quem cria a sala é o anfitrião (host): ele simula a partida e comanda o **INICIAR PARTIDA**.
As vagas livres são preenchidas por bots e vão sendo trocadas por humanos conforme entram. O goleiro é jogável.

## Controles

| Tecla | Ação |
| --- | --- |
| **WASD** / setas | mover |
| **Shift** | correr (gasta fôlego) |
| **Espaço** | pular |
| **E** | carrinho (desarme) |
| **F** | chutar (segure pra carregar) |
| **M** | ligar/desligar som |
| **H** | mostrar/ocultar ajuda |
| **Esc** | sair da sala |

Times: **AZUL** defende o gol da esquerda, **VERMELHO** o da direita. No lobby dá pra trocar de time e pegar o gol.

## Rodar localmente

É só estático, então qualquer servidor de arquivos funciona. Não precisa de build.

```powershell
# na pasta do projeto
python -m http.server 8080
# ou
npx serve .
```

Depois abra `http://localhost:8080`.

Para testar online com outra pessoa na mesma máquina, abra duas abas: crie a sala numa e entre com o código na outra.

## Deploy (Vercel)

1. Suba este repositório pro GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Framework Preset: **Other**. Build Command e Output Directory: deixe em branco.
4. Deploy. O Vercel serve o `index.html` como site estático e já entrega HTTPS (necessário pro WebRTC).

## Como funciona (arquitetura)

- **Host-autoritativo**: o anfitrião roda a física a 60 Hz e envia snapshots a 20 Hz.
- **Predição local**: cada cliente simula só o próprio jogador entre snapshots e reconcilia pelo `ack`.
- **Remotos/bola**: interpolados com ~120 ms de atraso para suavizar.
- **Transporte**: PeerJS (WebRTC data channels) com STUN público do Google/Cloudflare. Não há servidor de jogo.

Arquivos:

- `index.html`, `styles.css` — interface e HUD.
- `js/config.js` — constantes (física, campo, times).
- `js/sim.js` — física/simulação pura (testável fora do navegador).
- `js/ai.js` — bots (linha e goleiro).
- `js/net.js` — host e cliente PeerJS.
- `js/game.js` — loop, modos (treino/host/cliente), predição e reconciliação.
- `js/render.js` — desenho (campo, jogadores, bola, partículas, minimapa).
- `js/input.js`, `js/audio.js`, `js/ui.js`, `js/main.js` — entrada, som, telas e bootstrap.

## Limitações conhecidas

- Sem TURN: redes com NAT simétrico podem não conectar (FUNCIONA na maioria dos casos).
- O anfitrião precisa manter a aba aberta; se ele sair, a sala fecha.
- Não há placar persistente nem reconexão automática.
