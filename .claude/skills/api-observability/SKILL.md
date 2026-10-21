---
name: api-observability
description: When and how to log, add a metric, or add a trace span in this repo's api/ app, and which log level to use. Covers pino, request ids, OpenTelemetry metrics, what never to log, and how to check the result in Seq. Use when adding or changing a route, repository, middleware, background work, or external call in api/, or when deciding what to record.
---

# API observability

Setup and reference are in the Telemetry, Logging, Metrics, and Request logging sections of [docs/api-standards.md](../../../docs/api-standards.md). This skill says what to record while you build a feature.

Every request already gets a request id, one `Request completed` line (method, path, status, duration), an HTTP trace span, `http.server.request.duration`, and Node runtime metrics. Do not add those again. Record only what those cannot tell you.

## Pick the tool

| You want to know                                          | Use                                        |
| --------------------------------------------------------- | ------------------------------------------ |
| What happened, and in what order, for one request         | A log line                                 |
| How often, or how fast, over time. Whether it is trending | A metric                                   |
| Where the time went inside one slow request               | A span (usually automatic)                 |
| That a person must act now                                | A log at `error` or `fatal` (alerts later) |

If you would ask "how many per hour?", it is a metric. If you would ask "what happened to this one?", it is a log. Do not count by logging and grepping.

## Log levels

| Level   | Use for                                                                             | Example                                             |
| ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| `fatal` | The process is about to die                                                         | Uncaught exception (already handled)                |
| `error` | An operation failed and nobody asked it to. A person may need to look               | Repository call threw; an external API returned 500 |
| `warn`  | Something is off but we handled it, or the caller is at fault in a way worth seeing | A retry succeeded; a 4xx; a limit was hit           |
| `info`  | A business or lifecycle event, once per event. Low volume                           | Server started; tournament registered; job ran      |
| `debug` | Detail for finding a bug. Off by default, on with `LOG_LEVEL=debug`                 | Cache miss; query parameters; `/health` hit         |
| `trace` | Almost never                                                                        |                                                     |

- Expected failures (`HttpError` 404, 409, Zod 400) are not `error`. The request line already logs them at `warn`. Do not log them again in the route.
- Log once, where you handle the error. Do not log and rethrow; the same failure then shows twice.
- Never log inside a loop over rows. Log a count after it.
- Pick `info` only if you would still want the line at 100 requests per second. If not, it is `debug`.

## How to write the line

```ts
requestLogger(res, logger).info(
  { tournamentId, entrants },
  "Tournament registered",
);
```

- Fields first, then a short constant message. Never build the message with a template string: `'Registered ' + id` cannot be filtered or grouped.
- Use `requestLogger(res, logger)` inside a request so the line has `requestId` and a trace id. Use plain `logger` for start-up and background work.
- Name fields in camelCase and keep the same name for the same thing everywhere (`tournamentId`, not `tid` in one place and `id` in another).
- Pass errors as `{ err }`, so pino writes the type, message, and stack.

## Never log

Passwords, tokens, API keys, connection strings, whole request or response bodies, query strings, email addresses, phone numbers, or names of bowlers. Log ids instead. A bowler's name is personal data and the logs go to a third-party store.

## Add a metric only when

- A number would drive a decision or an alert (rejections, failures of an external call, job duration, queue depth).
- The HTTP and runtime metrics cannot answer it.

How:

- Name `tournament_director.<area>.<thing>`, with a unit (`{request}`, `s`, `By`).
- Counter for events, histogram for durations and sizes, gauge for a current value.
- Attributes must be few and from a fixed set (a status, a type, an outcome). Never an IP, id, user, path with an id in it, or free text. Each new value makes a new series and costs money in App Insights.
- Take a `Meter` as a dependency and create the instrument when the router or middleware is built. Test it with `MeterProvider` + `InMemoryMetricExporter`.

## Spans

HTTP and Express spans are automatic. When the database arrives, add its instrumentation package in `telemetry.ts` rather than writing spans by hand. Add a manual span only around work with no automatic one, such as a long calculation or a background job:

```ts
tracer.startActiveSpan('tournament.seed', (span) => { try { ... } finally { span.end() } })
```

Always end the span in `finally`. Name it `<area>.<action>`.

## Check your work

1. `npm run services:up`, then `npm run dev`, and call the route.
2. In Seq (http://localhost:15380) filter on the `requestId` from the response header. You should see the request line and your line, and the trace id opens the trace.
3. For a metric, open the Metrics view, or run `select sum(value) from series where @Metric = '<name>'`.
4. Ask whether the output is useful to someone at 2 a.m. who has never seen this code.

## Review checklist

- Does each new log have the right level from the table, a constant message, and fields?
- Is any expected failure logged as `error`, or the same failure logged twice?
- Does any line or attribute hold personal data, a secret, or a high-cardinality value?
- Is a metric added only because the automatic ones cannot answer the question?
- Is a new log or metric covered by a test (`createCapturedLogger`, `InMemoryMetricExporter`)?
