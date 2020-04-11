import { Request, RequestHandler, ErrorRequestHandler, Response, NextFunction } from 'express'
import { IncomingMessage } from 'http'
import { Connection, CookieOptions, Middleware, Status, execMiddleware, fromConnection } from './middleware'
import { LinkedList, nil, cons, toArray } from './llist'
import { fork, node } from 'fluture'

export type Action =
  | { type: 'setBody'; body: unknown }
  | { type: 'endResponse' }
  | { type: 'setStatus'; status: Status }
  | { type: 'setHeader'; name: string; value: string }
  | { type: 'clearCookie'; name: string; options: CookieOptions }
  | { type: 'setCookie'; name: string; value: string; options: CookieOptions }

const endResponse: Action = { type: 'endResponse' }

export class ExpressConnection implements Connection {
  constructor(
    readonly req: Request,
    readonly res: Response,
    readonly actions: LinkedList<Action> = nil,
    readonly ended: boolean = false
  ) {}
  chain(action: Action, ended: boolean = false): ExpressConnection {
    return new ExpressConnection(this.req, this.res, cons(action, this.actions), ended)
  }
  getRequest(): IncomingMessage {
    return this.req
  }
  getBody(): unknown {
    return this.req.body
  }
  getHeader(name: string): unknown {
    return this.req.header(name)
  }
  getParams(): unknown {
    return this.req.params
  }
  getQuery(): unknown {
    return this.req.query
  }
  getOriginalUrl(): string {
    return this.req.originalUrl
  }
  getMethod(): string {
    return this.req.method
  }
  setCookie(name: string, value: string, options: CookieOptions): ExpressConnection {
    return this.chain({ type: 'setCookie', name, value, options })
  }
  clearCookie(name: string, options: CookieOptions): ExpressConnection {
    return this.chain({ type: 'clearCookie', name, options })
  }
  setHeader(name: string, value: string): ExpressConnection {
    return this.chain({ type: 'setHeader', name, value })
  }
  setStatus(status: Status): ExpressConnection {
    return this.chain({ type: 'setStatus', status })
  }
  setBody(body: unknown): ExpressConnection {
    return this.chain({ type: 'setBody', body }, true)
  }
  endResponse(): ExpressConnection {
    return this.chain(endResponse, true)
  }
}

function run(res: Response, action: Action): Response {
  switch (action.type) {
    case 'clearCookie':
      return res.clearCookie(action.name, action.options)
    case 'endResponse':
      res.end()
      return res
    case 'setBody':
      return res.send(action.body)
    case 'setCookie':
      return res.cookie(action.name, action.value, action.options)
    case 'setHeader':
      res.setHeader(action.name, action.value)
      return res
    case 'setStatus':
      return res.status(action.status)
  }
}

function exec<E>(middleware: Middleware<E, void>, req: Request, res: Response, next: NextFunction): () => void {
  return fork(next)(c => {
    const { actions: list, res, ended } = c as ExpressConnection
    const len = list.length
    const actions = toArray(list)
    for (let i = 0; i < len; i++) {
      run(res, actions[i])
    }
    if (!ended) {
      next()
    }
  })(execMiddleware(middleware, new ExpressConnection(req, res)))
}

export function toRequestHandler<E>(middleware: Middleware<E, void>): RequestHandler {
  return (req, res, next) => exec(middleware, req, res, next)
}

export function toErrorRequestHandler<E>(f: (err: unknown) => Middleware<E, void>): ErrorRequestHandler {
  return (err, req, res, next) => exec(f(err), req, res, next)
}

export function fromRequestHandler<E = never, A = never>(
  requestHandler: RequestHandler,
  f: (req: Request) => A
): Middleware<E, A> {
  return fromConnection(c =>
    node(done => {
      const { req, res } = c as ExpressConnection
      requestHandler(req, res, () => done(null, f(req)))
    })
  )
}
