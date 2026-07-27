export function parseUrgencyDays(requiredBy) {
    const normalised = requiredBy.trim().toLowerCase();
    if (!normalised)
        return undefined;
    if (/\b(today|tonight|immediate(?:ly)?|urgent(?:ly)?)\b/.test(normalised)) {
        return 1;
    }
    const dayMatch = normalised.match(/(\d+(?:\.\d+)?)\s*days?\b/);
    if (dayMatch) {
        return Math.ceil(Number(dayMatch[1]));
    }
    const weekMatch = normalised.match(/(\d+(?:\.\d+)?)\s*weeks?\b/);
    if (weekMatch) {
        return Math.ceil(Number(weekMatch[1]) * 7);
    }
    return undefined;
}
