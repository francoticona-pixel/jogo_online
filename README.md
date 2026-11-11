# DUEL ARENA — protótipo 0.1

Jogo de tiro top-down multiplayer 1v1 para navegador de PC.

## Requisitos
- Node.js 18 ou superior
- Internet para instalar as dependências (e para jogar entre computadores)

## Rodar no seu computador
1. Extraia o ZIP.
2. Abra a pasta `duel-arena` no VS Code.
3. Abra o terminal nessa pasta.
4. Execute `npm install`.
5. Execute `npm start`.
6. Abra `http://localhost:3000` no navegador.

## Teste local
Abra duas janelas/abas do navegador, entre com o mesmo código de sala nas duas.
O primeiro jogador aguarda; quando o segundo entrar, a partida começa.

## Jogar com seu amigo pela internet
O servidor precisa ficar hospedado publicamente. Faça deploy desta pasta em um serviço que aceite Node.js (por exemplo, Render ou Railway), configure o comando de início como `npm start` e compartilhe a URL pública. Seu amigo abre a mesma URL e digita o mesmo código de sala.
Não use `localhost` para convidar seu amigo: localhost só funciona no próprio computador.

## Controles
- WASD ou setas: movimentar
- Mouse: mirar
- Clique esquerdo: atirar
- Botão “Copiar código”: copiar o código da sala

## Limitações desta primeira versão
- Protótipo inicial: personagens e arena são formas gráficas, sem sprites finais.
- A colisão com obstáculos ainda não está implementada.
- A vida e a pontuação são mantidas no servidor, mas ainda não há tela de fim de partida ou reconexão.
- O servidor é autoritativo para posições básicas e acertos, mas ainda precisa de melhorias anti-trapaça antes de uso competitivo público.
