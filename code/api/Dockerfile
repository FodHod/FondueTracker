# Stage 1: build the frontend bundle from the sibling folder.
# Build context is code/ (see .github/workflows/test-lint-build.yml),
# so all COPY paths below are relative to code/.
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY fronduend/package.json fronduend/package-lock.json ./
RUN npm ci
COPY fronduend/ ./
RUN npm run build

# Stage 2: the Express API server, serving the SPA from ./public.
FROM node:22-alpine
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/src ./src
COPY --from=frontend-build /build/dist ./public
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["npm", "start"]
