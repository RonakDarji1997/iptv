FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Accept build arguments for Next.js public environment variables
ARG NEXT_PUBLIC_STALKER_MAC
ARG NEXT_PUBLIC_STALKER_URL
ARG NEXT_PUBLIC_STALKER_BEARER
ARG NEXT_PUBLIC_STALKER_ADID
ARG NEXT_PUBLIC_APP_PASSWORD_HASH

# Set as environment variables for the build
ENV NEXT_PUBLIC_STALKER_MAC=$NEXT_PUBLIC_STALKER_MAC
ENV NEXT_PUBLIC_STALKER_URL=$NEXT_PUBLIC_STALKER_URL
ENV NEXT_PUBLIC_STALKER_BEARER=$NEXT_PUBLIC_STALKER_BEARER
ENV NEXT_PUBLIC_STALKER_ADID=$NEXT_PUBLIC_STALKER_ADID
ENV NEXT_PUBLIC_APP_PASSWORD_HASH=$NEXT_PUBLIC_APP_PASSWORD_HASH

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
