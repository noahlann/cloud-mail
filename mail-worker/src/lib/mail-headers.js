export function rawMailHeaders(content) {
	const bytes = new Uint8Array(content);
	for (let index = 0; index < bytes.length; index++) {
		if (bytes[index] !== 10) continue;
		if (bytes[index + 1] === 10) {
			return new TextDecoder().decode(bytes.subarray(0, index));
		}
		if (bytes[index + 1] === 13 && bytes[index + 2] === 10) {
			const end = bytes[index - 1] === 13 ? index - 1 : index;
			return new TextDecoder().decode(bytes.subarray(0, end));
		}
	}
	throw new Error('Incoming email has no header/body separator');
}

export function mailHeaderFields(parsed, content, envelopeFrom) {
	return {
		headers: JSON.stringify(parsed.headers || []),
		rawHeaders: rawMailHeaders(content),
		envelopeFrom: envelopeFrom || '',
	};
}
