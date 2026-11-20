# PHP 8.5.13 = the 2026-11-19 security release, the floor set by ADR-001 (research-technical.md §2).
FROM php:8.5.13-fpm-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libicu-dev libzip-dev unzip git postgresql-client \
 && docker-php-ext-install -j"$(nproc)" pdo_pgsql pgsql intl bcmath pcntl zip \
 && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2.11 /usr/bin/composer /usr/bin/composer
# Run as the host user so files written into the bind mount stay owned by them.
ARG UID=1000
ARG GID=1000
RUN groupmod -o -g "${GID}" www-data && usermod -o -u "${UID}" -g "${GID}" www-data
ENV COMPOSER_HOME=/tmp/composer
WORKDIR /var/www/html
USER www-data
