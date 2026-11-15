# The hosted trip site (Coolify builds this). Content (places/, areas/, answers/, config/) is baked into the image;
# what the traveler writes on the road (feedback/, trip/) lives on the /data volume. See docs/DEPLOY.md.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN chmod +x deploy/entrypoint.sh
ENV PORT=4400
EXPOSE 4400
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4400)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["deploy/entrypoint.sh"]
