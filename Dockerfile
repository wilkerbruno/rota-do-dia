# Rota do Dia: site estatico + API PHP (SQLite), para o Easypanel.
# Dados e credenciais ficam fora da pasta publica:
#   /var/www/rota-dados            -> volume (loja.sqlite, contagem.json)
#   /var/www/config/mercadopago.env -> arquivo montado (MP_PUBLIC_KEY, MP_ACCESS_TOKEN, ...)
FROM php:8.3-apache

RUN a2enmod rewrite headers \
 && sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf \
 && printf 'ServerTokens Prod\nServerSignature Off\n' > /etc/apache2/conf-enabled/zz-seguranca.conf \
 && mkdir -p /var/www/rota-dados /var/www/config \
 && chown www-data:www-data /var/www/rota-dados

COPY --chown=www-data:www-data . /var/www/html/

EXPOSE 80
