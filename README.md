# VELTACT_PinchMe_Hackathon

Veltact turns industrial requirements into qualified supplier responses and secures the selected engagement through Pinch Payments.

## Local API Setup

Install dependencies:

```bash
npm install
```

Create an API environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Fill `apps/api/.env` with Pinch test credentials from the Pinch developer portal. Use test credentials only.

```bash
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
PINCH_CLIENT_ID=your-pinch-test-client-id
PINCH_SECRET_KEY=your-pinch-test-secret-key
PINCH_AUTH_URL=https://auth.getpinch.com.au/connect/token
PINCH_API_BASE_URL=https://api.getpinch.com.au/test
PINCH_API_VERSION=2020.1
PINCH_RETURN_URL=http://localhost:5173/pinch/return
PINCH_WEBHOOK_SECRET=whsec_replace_with_pinch_webhook_secret
```

Start the API:

```bash
npm run dev -w apps/api
```

## Pinch Sandbox Tests

Check that the backend can authenticate with Pinch and call the authenticated sandbox health endpoint:

```bash
curl -s http://localhost:4000/api/pinch/health
```

Create a sandbox payer:

```bash
curl -s http://localhost:4000/api/pinch/test-payer \
  -H 'Content-Type: application/json' \
  -d '{
    "firstName": "Test",
    "lastName": "Buyer",
    "emailAddress": "test.buyer@example.com",
    "companyName": "Veltact Demo"
  }'
```

Create a hosted Payment Link using the returned `payerId`:

```bash
curl -s http://localhost:4000/api/pinch/payment-link \
  -H 'Content-Type: application/json' \
  -d '{
    "payerId": "pyr_replace_with_real_id",
    "amount": 10000,
    "description": "Veltact RapidMatch sandbox payment",
    "metadata": {
      "demo": "pinch-checkpoint"
    }
  }'
```

## Pinch Webhooks

Pinch sends webhook requests with a `pinch-signature` header. The API verifies `v2` as an HMAC-SHA256 signature of `{timestamp}.{raw request body}` using `PINCH_WEBHOOK_SECRET`, and rejects requests outside a five minute timestamp window.

Register the local endpoint with Pinch using a public tunnel URL:

```bash
https://your-public-tunnel.example.com/api/pinch/webhooks
```

Recent verified webhook events are held in memory for local demo inspection:

```bash
curl -s http://localhost:4000/api/pinch/webhooks/events
```
