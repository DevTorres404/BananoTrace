# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

# Generar cliente Prisma (requerido para ORM)
RUN npx prisma generate

# Compilar NestJS
RUN npm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /usr/src/app

# Solo copiamos lo necesario para correr en prod
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

# Opcional: configurar .env si lo leyera de archivo local, pero usaremos variables inyectadas por docker-compose

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
