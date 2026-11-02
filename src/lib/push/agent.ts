import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addSubnet("240.0.0.0", 4, "ipv4");
blocked.addAddress("255.255.255.255", "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("64:ff9b::", 96, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("::", 96, "ipv6");

function mappedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;
  const rest = lower.slice("::ffff:".length);
  if (isIP(rest) === 4) return rest;
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const hi = Number.parseInt(parts[0] ?? "", 16);
  const lo = Number.parseInt(parts[1] ?? "", 16);
  if (!Number.isInteger(hi) || !Number.isInteger(lo) || hi < 0 || lo < 0 || hi > 0xffff || lo > 0xffff) {
    return null;
  }
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/**
 * Not a public unicast address. Covers private, CGNAT, benchmarking,
 * multicast, reserved, loopback, link-local, unspecified, NAT64, 6to4,
 * IPv4-compatible (`::/96`, including `::127.0.0.1`), and IPv4-mapped IPv6.
 */
export function addressIsBlocked(address: string): boolean {
  const mapped = mappedIpv4(address);
  if (mapped) return blocked.check(mapped, "ipv4");
  if (isIP(address) === 4) return blocked.check(address, "ipv4");
  if (isIP(address) === 6) return blocked.check(address, "ipv6");
  return true;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * DNS lookup for the push agent. A resolver that returns a blocked address
 * fails the send instead of connecting.
 */
export function createPushLookup(resolve: typeof dnsLookup = dnsLookup) {
  return (hostname: string, options: LookupOptions | LookupCallback, callback?: LookupCallback) => {
    const opts: LookupOptions = typeof options === "function" ? {} : options;
    const done = typeof options === "function" ? options : callback;
    if (!done) throw new Error("lookup callback is required");
    resolve(hostname, opts, (err, address, family) => {
      if (err) {
        done(err, typeof address === "string" ? address : "", typeof family === "number" ? family : 0);
        return;
      }
      const list: LookupAddress[] = Array.isArray(address)
        ? address
        : [{ address, family: typeof family === "number" ? family : 4 }];
      if (list.length === 0 || list.some((item) => addressIsBlocked(item.address))) {
        const blockedError = new Error("push address is not public") as NodeJS.ErrnoException;
        blockedError.code = "EBLOCKED";
        done(blockedError, "", 0);
        return;
      }
      if (Array.isArray(address)) done(null, address);
      else done(null, address, family);
    });
  };
}

/** web-push 3.6.7 forwards `options.agent` into `https.request`. */
export function createPushAgent(): https.Agent {
  return new https.Agent({ keepAlive: false, lookup: createPushLookup() });
}
