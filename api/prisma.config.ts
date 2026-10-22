import { defineConfig } from 'prisma/config'

// Only the CLI (`prisma generate`) reads this file. The app builds its own client from config.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
})
