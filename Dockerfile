FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs
ENV GOLFPAD_DATA_DIR=/data
EXPOSE 4173
CMD ["node", "server.mjs"]
