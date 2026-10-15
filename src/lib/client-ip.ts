// src/lib/client-ip.ts
//
// The client's address as rate limits count it (audit 15.10.2026, item 3).

/**
 * Eight 16-bit groups of an IPv6 address, or null when it is not one.
 * Handles the "::" shorthand and a dotted IPv4 tail ("::ffff:1.2.3.4").
 */
function ipv6Groups(value: string): number[] | null {
  let head = value;
  const tail: number[] = [];
  const v4 = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (v4) {
    const octets = v4[2].split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    // "::1.2.3.4" keeps its "::"; "64:ff9b::1:1.2.3.4" drops the separator.
    head = v4[1].endsWith("::") ? v4[1] : v4[1].slice(0, -1);
    tail.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
  }

  const halves = head.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const group of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const left = parse(halves[0]);
  const right = halves.length === 2 ? parse(halves[1]) : [];
  if (left === null || right === null) return null;

  const room = 8 - tail.length;
  if (halves.length === 1) return left.length === room ? [...left, ...tail] : null;
  const zeros = room - left.length - right.length;
  if (zeros < 1) return null;
  return [...left, ...new Array<number>(zeros).fill(0), ...right, ...tail];
}

/**
 * What a rate limit counts: the address itself for IPv4, the /64 network for
 * IPv6.
 *
 * A home or hosting line gets a whole /64 (2^64 addresses), and the device
 * picks any of them at will. Keyed on the full address, `login:<ip>`,
 * `reg_ip:<ip>` (the welcome bonus) and every other per-address limit gave one
 * person an endless supply of fresh buckets. The /64 is what one subscriber
 * holds, so it is the unit to count.
 *
 * An IPv4-mapped address ("::ffff:1.2.3.4") counts as that IPv4 address. The
 * result is written as the network's address ("2001:db8:1:2::"). Anything that
 * does not parse is returned as is, cut to the longest address length, so a
 * key never grows with junk.
 */
export function rateLimitSubject(ip: string): string {
  const value = ip.trim().toLowerCase();
  if (!value.includes(":")) return value.slice(0, 45);
  const groups = ipv6Groups(value);
  if (groups === null) return value.slice(0, 45);
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::`;
}
