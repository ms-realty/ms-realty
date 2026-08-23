// Minimal RFC 7578 `multipart/form-data` reader.
//
// Photo upload is the first route in this codebase that has to accept bytes a
// browser produced without JavaScript, and a plain `<form enctype="multipart/
// form-data">` post is the only way to do that. Everything else on the wire is
// JSON or url-encoded, so instead of pulling in a parser dependency this module
// does the one job those routes need: split a bounded, already-buffered body
// into named parts and hand back exact bytes.
//
// Deliberate limits: the body is already capped by the server body limit before
// it reaches here, the part count is capped, and a malformed body throws rather
// than returning a partial parse. Nothing here trusts a declared content type or
// filename — callers sniff the bytes themselves.

const DASH_DASH = Buffer.from("--");
const CRLF = Buffer.from("\r\n");
const HEADER_TERMINATOR = Buffer.from("\r\n\r\n");

export function multipartBoundary(contentType) {
  const value = String(contentType || "");
  if (!/^\s*multipart\/form-data\s*;/i.test(value)) return null;
  const match = value.match(/;\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = (match?.[1] || match?.[2] || "").trim();
  if (!boundary || boundary.length > 70) return null;
  // RFC 2046 bchars. Anything else is a malformed or hostile boundary.
  if (!/^[0-9A-Za-z'()+_,\-./:=?\s]+$/.test(boundary) || boundary.endsWith(" ")) return null;
  return boundary;
}

function parseHeaders(block) {
  const headers = {};
  for (const line of block.toString("utf8").split("\r\n")) {
    const index = line.indexOf(":");
    if (index < 1) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

// `filename="…"` is attacker-controlled and is never used to build a path. It is
// parsed only so an error message can name the file the operator picked.
function dispositionValue(disposition, key) {
  const quoted = disposition.match(new RegExp(`;\\s*${key}\\s*=\\s*"([^"]*)"`, "i"));
  if (quoted) return quoted[1];
  const bare = disposition.match(new RegExp(`;\\s*${key}\\s*=\\s*([^;]+)`, "i"));
  return bare ? bare[1].trim() : "";
}

export function parseMultipart(body, contentType, { maxParts = 32 } = {}) {
  const boundary = multipartBoundary(contentType);
  if (!boundary) throw new Error("Upload requires a multipart/form-data body with a boundary");
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "latin1");
  if (!buffer.length) throw new Error("Upload requires a request body");

  const delimiter = Buffer.concat([CRLF, DASH_DASH, Buffer.from(boundary)]);
  // The first delimiter has no leading CRLF; normalise by prefixing one.
  const stream = Buffer.concat([CRLF, buffer]);
  const parts = [];
  let cursor = stream.indexOf(delimiter);
  if (cursor === -1) throw new Error("Upload body does not contain the declared multipart boundary");

  while (cursor !== -1) {
    const afterDelimiter = cursor + delimiter.length;
    if (stream.slice(afterDelimiter, afterDelimiter + 2).equals(DASH_DASH)) break;
    const headerStart = afterDelimiter + (stream.slice(afterDelimiter, afterDelimiter + 2).equals(CRLF) ? 2 : 0);
    const headerEnd = stream.indexOf(HEADER_TERMINATOR, headerStart);
    if (headerEnd === -1) throw new Error("Upload part is missing its headers");
    const headers = parseHeaders(stream.slice(headerStart, headerEnd));
    const bodyStart = headerEnd + HEADER_TERMINATOR.length;
    const next = stream.indexOf(delimiter, bodyStart);
    if (next === -1) throw new Error("Upload part is not terminated by the multipart boundary");

    const disposition = headers["content-disposition"] || "";
    const name = dispositionValue(disposition, "name");
    if (name) {
      if (parts.length >= maxParts) throw new Error(`Upload may contain at most ${maxParts} parts`);
      const filename = dispositionValue(disposition, "filename");
      parts.push({
        name,
        filename: filename || null,
        isFile: /;\s*filename\s*=/i.test(disposition),
        contentType: headers["content-type"] || "",
        bytes: stream.slice(bodyStart, next),
      });
    }
    cursor = next;
  }

  if (!parts.length) throw new Error("Upload body contains no named parts");
  return parts;
}

// Convenience view for routes that want scalar fields plus file parts.
export function multipartForm(body, contentType, options = {}) {
  const parts = parseMultipart(body, contentType, options);
  const fields = {};
  const files = [];
  for (const part of parts) {
    if (part.isFile) files.push(part);
    else if (!(part.name in fields)) fields[part.name] = part.bytes.toString("utf8");
  }
  return { fields, files, parts };
}
