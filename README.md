# n8n-nodes-privatus-analytics

**Simple, private website analytics, at work in your n8n workflows.** No cookies, honest numbers, and a dashboard you understand in seconds.

## Why Privatus Analytics

**Google Analytics is slow, confusing and hungry for data.** It sends what your visitors do to Google. In many countries it means showing a cookie pop-up (the box that asks visitors to accept cookies), and many people click "reject", so you never see them. Bots pad the numbers that are left.

**Privatus Analytics fixes that.** It counts visits to your website without cookies and never stores IP addresses. Bots are filtered out before they are counted. Your data is never sold or shared.

What you get:

- **A dashboard you understand in seconds.** Visitors, top pages and where people came from, all on one screen.
- **No cookie pop-up needed for our analytics.** We set no cookies and store no personal data. Laws differ by country, so check your own legal advice.
- **Honest numbers.** Known bots and fake traffic are left out on every plan.
- **Your numbers where you work.** Send stats to Slack, Sheets or any app n8n connects to, and start a workflow when an alert fires or a testimonial comes in. No code needed.
- **Data you own.** We never sell it or show you ads, and you can pull it out any time through the API.

**Start free.** The Free plan has 10,000 events a month and 3 sites, with no card. Every new account also gets 14 days of Pro free, with no card. [Create your account](https://privatusanalytics.com).

## What this package does

Two n8n community nodes for Privatus Analytics. They use only the public [Privatus Analytics API](https://privatusanalytics.com/docs/api) and its signed [webhooks](https://privatusanalytics.com/docs/api/webhooks), have no runtime dependencies, and never send your data anywhere except to `https://privatusanalytics.com`. They do not add a tracking script. Your site still needs the Privatus Analytics script to collect visits.

- **Privatus Analytics** node: read stats, manage goals, chart notes, campaigns, uptime checks, alerts, status pages, exports, members, site audits, experiments and testimonials (16 resources, 51 operations).
- **Privatus Analytics Trigger** node: start a workflow on any of 25 events, such as an alert firing, an uptime check going down, a new testimonial or a finished export. Every delivery is verified with its signature.

[n8n](https://n8n.io) is a workflow automation platform. See the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for how to install a package.

## Installation

1. In n8n, open **Settings**, then **Community Nodes**.
2. Choose **Install**, enter `n8n-nodes-privatus-analytics` and confirm.

On n8n Cloud the nodes appear in the nodes panel once the package is verified. On a self-hosted n8n you can also run `npm install n8n-nodes-privatus-analytics` in `~/.n8n/nodes`.

## Credentials

You need an API token of the Privatus Analytics workspace you want to use.

1. In Privatus Analytics, open **Workspace settings**, then **API tokens**, and create a token. It starts with `pat_`.
2. For every operation and the trigger to work, keep all permissions, choose **Every site you can access** and set the expiry to **never**. The trigger adds a webhook, which needs the workspace settings permission and every site.
3. In n8n, create a **Privatus Analytics API** credential and paste the token. n8n tests it with `GET /workspaces.json`.

A token belongs to exactly one workspace, so there is no workspace to choose. To use two workspaces, create two credentials.

## Privatus Analytics node

| Resource | Operations |
| --- | --- |
| Alert | Acknowledge, Get History, Get Many, Mute |
| Campaign | Add Cost, Create Link |
| Chart Note | Create, Create for Workspace |
| Custom API Call | Send |
| Experiment | End, Get, Get Many, Pause, Start |
| Export | Create, Get Many |
| Goal | Create, Get Many |
| Member | Get Many, Invite |
| Site | Create, Find by Domain, Get, Get Many |
| Site Audit | Get, Get Latest Finished, Get Many, Run |
| Stats | Get Live Visitors, Get Overview, Get Time Series, Get Top Values |
| Status Page | Get Many, Post Update |
| Testimonial | Approve, Create, Get, Get Many, Pin, Reject, Return to Pending, Unpin, Update |
| Testimonial Person | Create, Get Many |
| Testimonial Request | Add Recipient, Get Many |
| Uptime Check | Create, Get Many, Pause, Resume |

How it behaves:

- **Dropdowns** (sites, alert rules, uptime checks, experiments, testimonials, status pages, requests, segments, forms, tags and collections) are filled from your workspace. Every one also accepts an ID or an expression, for example `={{ $json.site_id }}`.
- **Return All and Limit** on every list. Return All reads every page (100 rows each).
- **Stats** operations take a period (last 7 days, month to date, custom and more), filters as a JSON list like `[["country","is","US"],["page","starts_with","/blog"]]`, and a saved segment. Get Top Values and Get Time Series return one item for each row or point.
- **Dates** can be picked or given as text. Day fields are sent as `YYYY-MM-DD` and the month of a campaign cost as `YYYY-MM`.
- **Errors** show the message of the API, with the field details of a validation error. A 402 says that a higher plan is needed.
- **Continue on Fail** is supported, and the node can be used as a tool by an AI agent.
- **Custom API Call** sends a `GET`, `POST`, `PATCH` or `PUT` to any path of the API with the credential of the node. Only a path on `privatusanalytics.com` is accepted, so the token cannot be sent anywhere else.

Nothing in this package deletes data. Deleting sites, testimonials, goals and the like is left to the Privatus Analytics app.

### Example: weekly traffic report

1. **Schedule Trigger**, every Monday at 8:00.
2. **Privatus Analytics**, resource Stats, operation Get Overview, your site, period Last 7 Days, Additional Fields, Compare With, Previous Period.
3. **Slack** or **Send Email**, with `{{ $json.metrics.visitors }}` and `{{ $json.change.visitors }}` in the message.

### Example: thank a happy customer

1. **Privatus Analytics Trigger**, event New Testimonial, filter Minimum Rating 5 Stars.
2. **Privatus Analytics**, resource Testimonial, operation Approve, with the site from `{{ $json.site_id }}` and the testimonial from `{{ $json.testimonial.id }}`.
3. **Send Email** to say thank you.

## Privatus Analytics Trigger node

<a name="trigger"></a>

Choose one or more events. When the workflow is activated the node creates one webhook in your workspace (`POST /workspaces/{id}/webhooks.json`) and keeps its signing secret. When the workflow is deactivated the webhook is deleted. Using the test button works the same way.

Events: Alert Resolved, Alert Triggered, Analytics Import Completed, Analytics Import Failed, Experiment Ended, Export Ready, Goal Alert Triggered, New Member, New Reviews Found by Sync, New Site, New Testimonial, Site Audit Completed, Site Deleted, Testimonial Approved, Testimonial Deleted, Testimonial Form Submitted, Testimonial Import Finished, Testimonial Moved to Trash, Testimonial Rejected, Testimonial Request Finished, Testimonial Request Sent, Testimonial Restored, Uptime Check Down, Uptime Check Recovered and Usage Threshold Reached.

**Filters** (all optional): Site, Alert Rule, Form, Request and Minimum Rating. A filter applies to the events that have that field, and the other events pass. A delivery that does not match is acknowledged and starts nothing.

**Security.** Every delivery has a `Privatus-Signature: t=<unix time>,v1=<hex>` header, where `v1` is the HMAC-SHA256 of `<t>.<raw body>` keyed with the signing secret. The node responds with `401` and starts nothing when the signature is missing, wrong, or more than five minutes old. n8n must give the node the raw request body for this check, which it does for JSON deliveries.

**Output.** One item for each delivery: the data of the event plus `id` (the delivery ID), `event`, `occurred_at` and `workspace_id`. An `id` inside the data moves to `record_id`, or `export_id` for Export Ready. The payloads are documented at [privatusanalytics.com/docs/api/webhooks](https://privatusanalytics.com/docs/api/webhooks).

## Development

```sh
npm install
npm run lint        # n8n-node lint (the n8n community nodes rules)
npm test            # builds, then runs the unit tests with node --test
npm run dev         # n8n with the nodes loaded, using n8n-node dev
npm run sync-spec   # refresh nodes/shared/spec.json from https://privatusanalytics.com/openapi.json
```

`nodes/shared/spec.json` is the part of the OpenAPI document that the nodes use. Labels, descriptions, choices and types of the fields come from it, and `nodes/shared/request.ts` builds every request from it (path parameters, lists as `status[]=a&status[]=b`, filters as JSON, typed bodies). Run `npm run sync-spec` after an API change.

Releasing: set the version in `package.json` and `CHANGELOG.md`, commit, and push a tag that matches it. The `Publish` workflow tests, builds and publishes to npm with provenance.

## License

[MIT](LICENSE)
