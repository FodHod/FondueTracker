FROM nginx:1.27-alpine

# Placeholder service: serves a dummy 200 response on every path so the
# deployment pipeline can be smoke-tested before any real code exists.
COPY default.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
