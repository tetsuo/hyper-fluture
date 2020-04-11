# hyper-fluture

monadic http middleware based on [hyper-ts](https://github.com/gcanti/hyper-ts).

* uses [flutures](https://github.com/fluture-js/Fluture) instead of promises
* not indexed

# install

```
npm install hyper-fluture
```

# hello world

```typescript
import * as express from 'express'
import * as H from 'hyper-fluture'
import { toRequestHandler } from 'hyper-fluture/lib/express'
import { pipe } from 'fp-ts/lib/pipeable'

const hello: H.Middleware<never, void> = pipe(
  H.status(H.Status.OK), // writes the response status
  H.chain(() => H.send('Hello hyper-fluture on express!')) // sends the response as text
)

express()
  .get('/', toRequestHandler(hello))
  .listen(3000, () => console.log('Express listening on port 3000. Use: GET /'))
```
