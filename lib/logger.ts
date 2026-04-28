const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const
type Level = keyof typeof LEVELS

const configured = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? "info").toLowerCase() as Level
const threshold = LEVELS[configured] ?? LEVELS.info

const logger = {
  debug: (...args: unknown[]) => { if (LEVELS.debug >= threshold) console.debug(...args) },
  info:  (...args: unknown[]) => { if (LEVELS.info  >= threshold) console.log(...args) },
  warn:  (...args: unknown[]) => { if (LEVELS.warn  >= threshold) console.warn(...args) },
  error: (...args: unknown[]) => { if (LEVELS.error >= threshold) console.error(...args) },
}

export default logger
