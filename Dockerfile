FROM node:lts-alpine
WORKDIR /app
COPY package.json server.js index.html styles.css script.js ./
EXPOSE 3000
CMD ["node", "server.js"]
