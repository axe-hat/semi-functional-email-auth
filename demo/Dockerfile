# syntax=docker/dockerfile:1
# Build context is the repository root: the demo imports the library from ../src.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY demo/package.json demo/package-lock.json ./demo/
RUN npm --prefix demo ci
COPY tsconfig.json ./
COPY src ./src
COPY demo ./demo
ARG VITE_PHONE_EMAIL_CLIENT_ID=""
ENV VITE_PHONE_EMAIL_CLIENT_ID=$VITE_PHONE_EMAIL_CLIENT_ID
RUN npm --prefix demo run build

FROM nginx:1.29-alpine
# Where the API runs; the template is rendered into conf.d/default.conf at start-up.
ENV API_UPSTREAM=http://server:4000
COPY demo/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/demo/dist /usr/share/nginx/html
EXPOSE 8080
