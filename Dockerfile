FROM node:23-alpine

WORKDIR /app
RUN mkdir downloads
RUN mkdir public
COPY ./src/ src/
COPY package-lock.json package.json tsconfig.json ./
RUN npm i
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]