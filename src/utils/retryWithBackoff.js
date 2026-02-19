function nowMs() {
    return Date.now();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfterHeader) {
    if (!retryAfterHeader) return null;

    const asNumber = Number(retryAfterHeader);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
        return asNumber * 1000;
    }

    const asDate = Date.parse(retryAfterHeader);
    if (!Number.isNaN(asDate)) {
        return Math.max(0, asDate - nowMs());
    }

    return null;
}

async function retryWithBackoff(task, options = {}) {
    const {
        retries = 3,
        baseDelayMs = 500,
        maxDelayMs = 10000,
        shouldRetry = () => false,
        getDelayMs,
    } = options;

    let attempt = 0;
    while (attempt <= retries) {
        const result = await task({ attempt });
        const canRetry = attempt < retries;
        if (!shouldRetry(result) || !canRetry) {
            return result;
        }

        const defaultDelayMs = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
        const delayMs = getDelayMs ? getDelayMs({ result, attempt, defaultDelayMs }) : defaultDelayMs;
        await sleep(delayMs);
        attempt += 1;
    }
}

export { parseRetryAfterMs, retryWithBackoff };
