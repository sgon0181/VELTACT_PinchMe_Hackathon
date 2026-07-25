type StoredWebhookEvent = {
  id?: string;
  type?: string;
  eventDate?: string;
  receivedAt: string;
};

const webhookEvents: StoredWebhookEvent[] = [];

export function recordWebhookEvent(payload: unknown) {
  const event = normaliseWebhookPayload(payload);
  webhookEvents.unshift({
    ...event,
    receivedAt: new Date().toISOString()
  });

  webhookEvents.splice(25);
  return webhookEvents[0];
}

export function listWebhookEvents() {
  return webhookEvents;
}

function normaliseWebhookPayload(payload: unknown): Omit<StoredWebhookEvent, "receivedAt"> {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  return {
    id: getString(record.Id) ?? getString(record.id),
    type: getString(record.Type) ?? getString(record.type),
    eventDate: getString(record.EventDate) ?? getString(record.eventDate)
  };
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
