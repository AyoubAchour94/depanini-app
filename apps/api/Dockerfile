# API container image (Cloud Run). Build from the REPO ROOT so the workspace
# packages are in the context:
#
#   docker build -f apps/api/Dockerfile -t depanini-api .

FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @depanini/api... build \
 && pnpm --filter @depanini/api deploy --legacy --prod /out

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
COPY --from=build /repo/apps/api/dist ./dist
USER node
# Cloud Run injects PORT (8080); env.ts reads it.
EXPOSE 8080
CMD ["node", "dist/main.js"]
