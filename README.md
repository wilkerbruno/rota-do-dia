# Rota do Dia

Jogo diário de palavras por sílabas, em português. Site estático com uma API PHP pequena (contador de partidas e loja de moedas com Mercado Pago, em modo teste). No ar em https://trevoapostas.com.

O histórico até 21/11/2026 veio de `DivisionsTech/jogos/rota-do-dia`.

## Rodar localmente

```bash
python -m http.server 8000      # só o jogo, sem a API
node --test tests/              # testes do gerador e da carteira
```

Com a API (precisa de Docker):

```bash
docker build -t rota-do-dia .
docker run -p 8080:80 -v rota-dados:/var/www/rota-dados rota-do-dia
```

## Publicar no Easypanel

1. Serviço do tipo **App**, fonte GitHub (este repositório, branch `main`), build por **Dockerfile**. Porta 80.
2. **Volume** montado em `/var/www/rota-dados` (guarda `loja.sqlite` e `contagem.json`; sem ele os dados somem a cada deploy).
3. Loja: crie o arquivo montado `/var/www/config/mercadopago.env` com `MP_AMBIENTE`, `MP_PUBLIC_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `LOJA_PUBLICA`. Nunca coloque essas chaves no repositório. Sem o arquivo, a loja responde 503 e o jogo funciona normalmente.
4. Domínios: `trevoapostas.com` e `www.trevoapostas.com`. No Cloudflare, aponte o DNS para a VPS (proxy ligado, SSL em Full).
5. Confira: `/`, `/ads.txt`, `/sitemap.xml`, `/api/config-loja.php` e `/detail.php` (tem que dar 410).

O `.htaccess` força HTTPS só quando o pedido não veio do proxy em HTTPS (`X-Forwarded-Proto`), então funciona no cPanel e no container.
