---
name: kaafil-webhooks
description: Reacting to Kaafil events from your backend — the events feed, webhook deliveries and replay, testing an endpoint, and writing a handler that is safe against duplicates and out-of-order delivery.
license: "MIT"
compatibility: "Node.js >=18; kaafil-js ^0.1.0-beta.7"
metadata:
  author: "Kaafil"
  version: "0.1.0"
  tags: "kaafil webhooks events delivery replay handler backend notification"
---

> **Ground truth:** the installed `kaafil-js` — `kaafil.events`
> (`list`, `listPage`) and `kaafil.webhooks`
> (`deliveries`, `replay`, `testEvent`).
> **Docs:** https://developer.kaafil.in/docs/guides/modules/webhooks-and-events
> · **Docs MCP:** `claude mcp add --transport http kaafil-docs https://developer.kaafil.in/api/mcp`

## Two ways to learn what changed

| | Use when |
|---|---|
| **Webhooks** | You want to be told. Normal case. |
| **`kaafil.events.list`** | You want to ask — backfills, reconciliation, or a gap after downtime. |

They cover the same event stream. Having both means a missed delivery is
recoverable by polling rather than lost.

## The handler contract

Write the handler before you register the endpoint, and write it to
survive the three things that always happen in production.

### 1. You will receive duplicates

At-least-once delivery is the norm. A network blip during your `200`
means a redelivery of an event you already processed.

**Make the handler idempotent on the event id.** Record processed ids and
skip repeats. Do not rely on "it probably won't happen".

### 2. Events can arrive out of order

Two events about the same trip can land in the wrong order.

**Do not derive state from the order of arrival.** If an event says a
trip is now `COMPLETED` and you already recorded `CANCELLED` from a later
change, arrival order has misled you. Use the event's own timestamp, or
re-read the resource and trust that.

The safest handler shape: treat the event as a **hint that something
changed**, then re-read the resource and reconcile. Slightly more work,
immune to both duplicates and ordering.

### 3. Your endpoint will be down at some point

Return `2xx` fast. Do the work asynchronously.

A handler that runs a slow reconciliation inline will time out, which
Kaafil reads as a failed delivery, which produces a retry, which lands on
the same slow handler. Acknowledge, enqueue, process.

## Inspecting deliveries

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

export function webhookTools() {
  return {
    deliveries: kaafil.webhooks.deliveries, // what was sent, and what your endpoint answered
    replay: kaafil.webhooks.replay,         // re-send one you mishandled
    testEvent: kaafil.webhooks.testEvent,   // fire a synthetic event at your endpoint
  };
}
```

`testEvent` is how you develop the handler without waiting for something
real to happen. `replay` is how you recover after fixing a bug — you do
not have to reconstruct the event yourself.

## Polling the feed instead

```ts
import { Kaafil } from 'kaafil-js';

const kaafil = new Kaafil({ apiKey: process.env.KAAFIL_API_KEY!, environment: 'test' });

export async function recentEvents() {
  return kaafil.events.list({});
}
```

`listPage` gives explicit cursor control — see `kaafil-js-pagination`.
Use this to close a gap after an outage rather than replaying deliveries
one by one.

## Environments are separate

A `test` webhook fires only for `test` events. Point your staging
endpoint at the test environment and your production endpoint at live;
they are separate tenants and will not cross.

## NEVER

- **Never assume exactly-once delivery.** Deduplicate on the event id.
- **Never derive state from arrival order.** Use timestamps, or re-read.
- **Never do slow work before responding.** Acknowledge, then process.
- **Never trust an event's payload as the full current state.** It
  describes a change; the resource is the truth.
- **Never expose the handler without verifying the request is really from
  Kaafil.** An unauthenticated endpoint that mutates your data on request
  is an open door.
- **Never point a live endpoint at test events**, or the reverse.
