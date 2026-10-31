import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'

export const SESSION_COOKIE = '_session'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

declare module 'express-serve-static-core' {
    interface Request {
        /** Session user id; issued in the _session cookie, identity only. */
        userId: string
    }
}

function readSessionCookie(req: Request): string | undefined {
    const header = req.headers.cookie
    if (!header) {
        return undefined
    }
    for (const part of header.split(';')) {
        const eq = part.indexOf('=')
        if (eq !== -1 && part.slice(0, eq).trim() === SESSION_COOKIE) {
            return part.slice(eq + 1).trim()
        }
    }
    return undefined
}

/**
 * Issues the opaque `_session` identity cookie on first contact and keeps it
 * stable afterwards. The cookie carries identity only — all mutable state
 * (claims, food) lives in the in-memory fork store.
 */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
    res.set('Cache-Control', 'no-store')

    let userId = readSessionCookie(req)
    if (!userId || !UUID_PATTERN.test(userId)) {
        userId = randomUUID()
        res.cookie(SESSION_COOKIE, userId, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: THIRTY_DAYS_MS,
            secure: process.env.NODE_ENV === 'production',
        })
    }
    req.userId = userId
    next()
}
