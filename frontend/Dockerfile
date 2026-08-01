# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Compilar Angular
RUN npm run build --configuration=production

# Stage 2: Serve
FROM nginx:alpine

# Borrar contenido default de nginx
RUN rm -rf /usr/share/nginx/html/*

# Copiar el build de Angular a nginx (asumiendo output de Angular 17+ browser)
COPY --from=builder /usr/src/app/dist/frontend/browser /usr/share/nginx/html

# Configuración custom de nginx para que las rutas SPA funcionen (fallback a index.html)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
