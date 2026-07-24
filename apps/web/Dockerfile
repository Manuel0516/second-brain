FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

COPY apps/web ./apps/web
RUN npm run build --workspace @secondbrain/web

FROM nginx:1.29-alpine

COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# The VPS checkout may use a restrictive umask; nginx must be able to read all static files.
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80
