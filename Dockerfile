FROM node:23-alpine

WORKDIR /app
RUN mkdir downloads
COPY ./src/ src/
COPY package-lock.json package.json tsconfig.json ./
RUN npm i
RUN npm run build
CMD ["npm", "start"]