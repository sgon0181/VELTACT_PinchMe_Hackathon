const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Formats the date-only value produced by the canonical supplier form without
 * allowing the browser or server timezone to shift the calendar day.
 *
 * Supplier availability can also be a human phrase (for example, "Within four
 * hours"). Those phrases, ISO timestamps and invalid calendar dates are
 * intentionally returned unchanged.
 */
export function formatSupplierAvailability(value) {
    if (!dateOnlyPattern.test(value))
        return value;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== value) {
        return value;
    }
    const month = new Intl.DateTimeFormat("en-AU", {
        month: "short",
        timeZone: "UTC"
    }).format(date);
    return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}
//# sourceMappingURL=dateFormatting.js.map