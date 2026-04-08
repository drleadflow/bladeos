import { z } from 'zod'

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  AUTH_SECRET: z.string().optional(),
  DATABASE_URL: z.string().default('file:./blade.db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  return envSchema.parse(process.env)
}

export const env = loadEnv()
