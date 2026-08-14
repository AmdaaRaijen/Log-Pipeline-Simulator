FROM node:20-alpine

# Install pnpm via corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js application
RUN pnpm run build

# Expose the application port
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

# Start the Next.js server
CMD ["pnpm", "start"]
