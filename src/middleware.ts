import { IncomingMessage } from 'http'
import * as F from 'fp-ts-fluture/lib/Future'
import { pipe } from 'fp-ts/lib/pipeable'
import * as SF from 'fp-ts-fluture/lib/StateFuture'
import { stringifyJSON } from 'fp-ts/lib/Either'

export * from 'fp-ts-fluture/lib/StateFuture'

export interface CookieOptions {
  readonly expires?: Date
  readonly domain?: string
  readonly httpOnly?: boolean
  readonly maxAge?: number
  readonly path?: string
  readonly sameSite?: boolean | 'strict' | 'lax'
  readonly secure?: boolean
  readonly signed?: boolean
}

export const MediaType = {
  applicationFormURLEncoded: 'application/x-www-form-urlencoded',
  applicationJSON: 'application/json',
  applicationJavascript: 'application/javascript',
  applicationOctetStream: 'application/octet-stream',
  applicationXML: 'application/xml',
  imageGIF: 'image/gif',
  imageJPEG: 'image/jpeg',
  imagePNG: 'image/png',
  multipartFormData: 'multipart/form-data',
  textCSV: 'text/csv',
  textHTML: 'text/html',
  textPlain: 'text/plain',
  textXML: 'text/xml'
} as const

export type MediaType = typeof MediaType[keyof typeof MediaType]

export const Status = {
  OK: 200,
  Created: 201,
  Found: 302,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ServerError: 500
} as const

export type Status = typeof Status[keyof typeof Status]

export interface Connection {
  readonly getRequest: () => IncomingMessage
  readonly getBody: () => unknown
  readonly getHeader: (name: string) => unknown
  readonly getParams: () => unknown
  readonly getQuery: () => unknown
  readonly getOriginalUrl: () => string
  readonly getMethod: () => string
  readonly setCookie: (this: Connection, name: string, value: string, options: CookieOptions) => Connection
  readonly clearCookie: (this: Connection, name: string, options: CookieOptions) => Connection
  readonly setHeader: (this: Connection, name: string, value: string) => Connection
  readonly setStatus: (this: Connection, status: Status) => Connection
  readonly setBody: (this: Connection, body: unknown) => Connection
  readonly endResponse: (this: Connection) => Connection
}

export type Middleware<E, A> = SF.StateFuture<Connection, E, A>

export function gets<E = never, A = never>(f: (c: Connection) => A): Middleware<E, A> {
  return c => F.right([f(c), c])
}

export function fromConnection<E = never, A = never>(f: (c: Connection) => F.Future<E, A>): Middleware<E, A> {
  return c => F.future.map(f(c), a => [a, c])
}

export function modifyConnection<E>(f: (c: Connection) => Connection): Middleware<E, void> {
  return c => F.right([undefined, f(c)])
}

export function evalMiddleware<E, A>(ma: Middleware<E, A>, c: Connection): F.Future<E, A> {
  return pipe(
    ma(c),
    F.map(([a]) => a)
  )
}

export function execMiddleware<E, A>(ma: Middleware<E, A>, c: Connection): F.Future<E, Connection> {
  return pipe(
    ma(c),
    F.map(([, c]) => c)
  )
}

export function decodeHeader<E, A>(name: string, f: (input: unknown) => F.Future<E, A>): Middleware<E, A> {
  return fromConnection(c => f(c.getHeader(name)))
}

export function decodeMethod<E, A>(f: (method: string) => F.Future<E, A>): Middleware<E, A> {
  return fromConnection(c => f(c.getMethod()))
}

export function decodeBody<E, A>(f: (input: unknown) => F.Future<E, A>): Middleware<E, A> {
  return fromConnection(c => f(c.getBody()))
}

export function decodeQuery<E, A>(f: (input: unknown) => F.Future<E, A>): Middleware<E, A> {
  return fromConnection(c => f(c.getQuery()))
}

export function decodeParams<E, A>(f: (input: unknown) => F.Future<E, A>): Middleware<E, A> {
  return fromConnection(c => f(c.getParams()))
}

const isUnknownRecord = (u: unknown): u is Record<string, unknown> => u !== null && typeof u === 'object'

export function decodeParam<E, A>(name: string, f: (input: unknown) => F.Future<E, A>): Middleware<E, A> {
  return fromConnection(c => {
    const params = c.getParams()
    return f(isUnknownRecord(params) ? params[name] : undefined)
  })
}

export function status<E = never>(status: Status): Middleware<E, void> {
  return modifyConnection(c => c.setStatus(status))
}

export function header<E = never>(name: string, value: string): Middleware<E, void> {
  return modifyConnection(c => c.setHeader(name, value))
}

export function contentType<E = never>(mediaType: MediaType): Middleware<E, void> {
  return header('Content-Type', mediaType)
}

export function cookie<E = never>(name: string, value: string, options: CookieOptions): Middleware<E, void> {
  return modifyConnection(c => c.setCookie(name, value, options))
}

export function clearCookie<E = never>(name: string, options: CookieOptions): Middleware<E, void> {
  return modifyConnection(c => c.clearCookie(name, options))
}

export function send<E = never>(body: string): Middleware<E, void> {
  return modifyConnection(c => c.setBody(body))
}

const ended: Middleware<never, void> = modifyConnection(c => c.endResponse())

export function end<E = never>(): Middleware<E, void> {
  return ended
}

export function json<E>(body: unknown, onError: (reason: unknown) => E): Middleware<E, void> {
  return pipe(
    SF.fromEither<Connection, E, string>(stringifyJSON(body, onError)),
    SF.chain(json =>
      pipe(
        contentType<E>(MediaType.applicationJSON),
        SF.chain(() => send(json))
      )
    )
  )
}

export function redirect<E = never>(uri: string): Middleware<E, void> {
  return pipe(
    status(Status.Found),
    SF.chain(() => header('Location', uri))
  )
}
