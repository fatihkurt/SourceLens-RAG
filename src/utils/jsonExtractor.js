function escapeRawNewlinesInJsonStrings(input) {
    let out = '';
    let inString = false;
    let escaped = false;
    const validEscapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i];

        if (!inString) {
            if (ch === '"') inString = true;
            out += ch;
            continue;
        }

        if (escaped) {
            escaped = false;
            out += ch;
            continue;
        }

        if (ch === '\\') {
            const next = input[i + 1];
            if (next && validEscapes.has(next)) {
                escaped = true;
                out += ch;
            } else {
                // Preserve invalid backslashes as literal characters.
                out += '\\\\';
            }
            continue;
        }

        if (ch === '"') {
            inString = false;
            out += ch;
            continue;
        }

        if (ch === '\r') {
            continue;
        }

        if (ch === '\n') {
            out += '\\n';
            continue;
        }

        const code = ch.charCodeAt(0);
        if (code < 0x20) {
            out += `\\u${code.toString(16).padStart(4, '0')}`;
            continue;
        }

        out += ch;
    }

    return out;
}

function parseJsonLenient(input) {
    try {
        return JSON.parse(input);
    } catch (_) {
        // Fall through to repaired parse.
    }

    try {
        return JSON.parse(escapeRawNewlinesInJsonStrings(input));
    } catch (_) {
        return null;
    }
}

function extractFirstJsonObject(text) {
    if (!text) return null;

    const trimmed = text.trim();
    const direct = parseJsonLenient(trimmed);
    if (direct !== null) return direct;

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{') {
            if (depth === 0) start = i;
            depth += 1;
            continue;
        }

        if (ch === '}' && depth > 0) {
            depth -= 1;
            if (depth === 0 && start !== -1) {
                const candidate = text.slice(start, i + 1);
                const parsed = parseJsonLenient(candidate);
                if (parsed !== null) return parsed;
                start = -1;
            }
        }
    }

    return null;
}

export { extractFirstJsonObject };
