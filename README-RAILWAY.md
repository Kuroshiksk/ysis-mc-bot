# YSIS MC — atualização de música, molduras e comandos do Dono

## Mudanças
- Reprodução YouTube passa a usar yt-dlp com stdout transmitido para o player de voz e FFmpeg a descodificar o formato real.
- Erros do yt-dlp e do player ficam registados nos Deploy Logs.
- Molduras com raridades e quatro molduras exclusivas de loot box.
- `/lootbox` custa 2.500 Bit coin; probabilidades aproximadas: 85% molduras de loja, 10% Aurora/Eclipse, 4% Glitch e 1% Vazio Absoluto (a seleção de raridade é probabilística).
- Novos comandos administrativos: `/setarconquista`, `/setarinsignia`, `/setarrep`, `/setardestaque`, `/removerdestaque`, `/setardaily`.
- Comandos de alteração de moedas e estes novos comandos exigem o cargo configurado em `OWNER_ROLE_ID`.
- A moeda padrão/migrada passa de “moedas” para “Bit coin” e emoji ₿; os saldos existentes não são alterados.

## Deploy
1. Substitui `index.js`, `package.json` e este README no GitHub.
2. No Railway, define `OWNER_ROLE_ID` como o ID do cargo Dono (ex.: `1402707266477621270`).
3. Aguarda o deploy.
4. Testa `/music` e confere Deploy Logs se houver erro.

## Música
O bot usa yt-dlp para obter o áudio e o FFmpeg para convertê-lo para o formato usado pelo Discord. O acesso ao YouTube pode ser bloqueado ou alterado externamente; os logs passam a incluir o erro concreto. Não partilhes tokens do bot.
