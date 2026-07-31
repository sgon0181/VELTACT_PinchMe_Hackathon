export async function copyText(value) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return "clipboard";
        }
        catch {
            // Browser permissions can reject the async clipboard API. Keep a
            // synchronous fallback available for secure localhost and older clients.
        }
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
        if (document.execCommand("copy"))
            return "legacy";
    }
    catch {
        // The caller reports a visible, actionable status below.
    }
    finally {
        textarea.remove();
    }
    throw new Error("Copy was blocked by this browser. Open the supplier link and copy its address from the browser.");
}
