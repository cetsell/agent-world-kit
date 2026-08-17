FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY web ./web
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production WORLDKIT_DATA_DIR=/data WORLDKIT_PORT=4317 WORLDKIT_HOST=0.0.0.0
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/web ./web
VOLUME ["/data"]
EXPOSE 4317
CMD ["node", "dist/cli.js", "serve", "--data", "/data"]
