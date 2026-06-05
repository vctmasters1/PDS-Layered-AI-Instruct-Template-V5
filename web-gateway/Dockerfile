FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Copy routing config template (uses ${HMI_HOST}, ${HMI_PORT}, ${MKT_HOST}, ${MKT_PORT})
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# At container start: substitute env vars into the template, then launch nginx
# envsubst with an explicit var list prevents nginx's $host/$remote_addr etc. from being substituted
CMD ["/bin/sh", "-c", "envsubst '${HMI_HOST} ${HMI_PORT} ${MKT_HOST} ${MKT_PORT} ${PROP_HOST} ${PROP_PORT} ${RESUME_HOST} ${RESUME_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
