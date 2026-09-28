FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* variables at BUILD time (setting them at runtime has no effect)
ARG VITE_API_MODE=local
ARG VITE_LOCAL_API_URL=/api
ENV VITE_API_MODE=$VITE_API_MODE
ENV VITE_LOCAL_API_URL=$VITE_LOCAL_API_URL
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
