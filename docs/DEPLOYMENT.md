# Free hackathon deployment

Veltact is configured as one free Render Node service. Express serves the
frontend, API, supplier pages, Socket.IO connection, and demo payment routes
from the same origin.

## What this deployment intentionally does

- deploys the `Recurssion` branch automatically;
- runs the deterministic research and supplier demo;
- uses visibly labelled local-demo payment evidence;
- prepares supplier invitations without pretending that email was delivered;
- requires no Pinch, OpenAI, Resend, or Twilio secrets;
- uses `https://veltact.com` for public links and redirects.

## Free-tier limitations

- The service can take a little while to wake after inactivity.
- JSON demo data is stored on an ephemeral filesystem and can reset after a
  restart or redeploy.
- The public guided demo is intentionally enabled for hackathon judging.
- This configuration is for the competition, not a real commercial launch.

## Deploy

1. Sign in to <https://dashboard.render.com/>.
2. Choose **New > Blueprint**.
3. Connect `sgon0181/VELTACT_PinchMe_Hackathon`.
4. Select the `Recurssion` branch if Render asks for a branch.
5. Apply the detected `render.yaml`.
6. Wait for the service to report **Live**.
7. Verify `https://YOUR-RENDER-HOST/api/health` returns `"status": "ok"`.

## Connect veltact.com

Cloudflare currently has these website records:

```text
@    A    185.158.133.1
www  A    185.158.133.1
```

They must remain until the Render URL works. Render will show the exact DNS
records under **Settings > Custom Domains**.

At cutover:

1. Replace only the `@` and `www` website records with Render's exact values.
2. Start with Cloudflare proxy status set to **DNS only**.
3. Keep every Google Workspace MX and TXT record unchanged.
4. Verify the custom domain in Render.
5. Test the landing page, `/api/health`, guided demo, buyer workspace, supplier
   invitation, and demo payment flow.

## Rollback

If the new deployment does not work, restore:

```text
@    A    185.158.133.1
www  A    185.158.133.1
```

Do not alter the Google Workspace mail records.
