import { createLogger, format, transports } from 'winston'

const { combine, colorize, timestamp, printf } = format

/**
 * The process logger. Debug level by default so the dip lifecycle events are
 * visible out of the box; `LOG_LEVEL` overrides for quieter deployments.
 */
export const logger = createLogger({
    level: process.env.LOG_LEVEL ?? 'debug',
    format: combine(
        colorize(),
        timestamp(),
        printf(({ level, message, timestamp, ...meta }) => {
            const extras = Object.entries(meta)
                .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
                .join(' ')
            return `${timestamp} ${level} ${message}${extras ? ' ' + extras : ''}`
        }),
    ),
    transports: [new transports.Console()],
})
