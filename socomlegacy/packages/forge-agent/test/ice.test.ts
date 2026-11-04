import { describe, it, expect } from "vitest";
import { BlockList } from "node:net";
import { createGateway } from "../src/gateway.js";
import { publicCandidate } from "../src/sessions.js";
import type { SignalToPage } from "@s2u/forge-agent-protocol";
// LATER 430 (browser adaptation, gateway policy): the gateway caps the page's ICE candidates per session and, in
// production, neither dials nor reveals private, link-local, loopback or named candidate addresses.
const line = (address: string) => `candidate:1 1 udp 2130706431 ${address} 50000 typ host`;
const srflx = (address: string, related: string) =>
  `candidate:2 1 udp 1694498815 ${address} 50001 typ srflx raddr ${related} rport 50000`;
async function paired(development: boolean, answer = "answer") {
  const origin = development ? "http://localhost:5361" : "https://forge.example";
  const sent: SignalToPage[] = [],
    dialled: unknown[] = [],
    answered: string[] = [];
  let gathered!: (candidate: unknown) => void;
  const g = createGateway({
    issuer: development ? "http://127.0.0.1:5360" : "https://forge.example",
    origins: [origin],
    development,
    trustedProxies: development ? 0 : 1,
    peerFactory: (signal) => {
      gathered = signal;
      return {
        offer: async () =>
          [
            "v=0",
            `a=${line("192.168.1.5")}`,
            `a=${line("203.0.113.7")}`,
            `a=${srflx("203.0.113.8", "192.168.1.5")}`,
            "a=end-of-candidates",
            "",
          ].join("\r\n"),
        answer: async (sdp) => {
          answered.push(sdp);
        },
        ice: async (candidate) => {
          dialled.push(candidate);
        },
        request: async (r) => ({ requestId: r.requestId, revision: 0, outcome: "ok" }),
        close: async () => {},
      };
    },
  });
  const p = g.state.register(origin, { surface: "forge-editor", name: "Forge", build: "test" });
  g.state.attach(origin, p.pageToken, (m) => sent.push(m));
  const pair = g.state.pair("a", p.invitation, ["inspect"], "agent");
  await g.state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions: ["inspect"] });
  const binding = { sessionId: pair.sessionId, targetId: p.targetId, epoch: p.epoch };
  const answerResult = g.state.signal(p.targetId, { type: "answer", ...binding, sdp: answer }).then(
    () => undefined,
    (e: Error) => e,
  );
  const ice = (candidate: unknown) => g.state.signal(p.targetId, { type: "ice", ...binding, candidate });
  return { g, sent, dialled, answered, answerError: await answerResult, gathered: (c: unknown) => gathered(c), ice };
}
describe("LATER 430: server-side ICE candidates capped and filtered", () => {
  it("in production drops private, link-local, loopback and named candidates both ways", async () => {
    const r = await paired(false);
    try {
      const offer = r.sent.find((m) => m.type === "offer") as { sdp: string };
      expect(offer.sdp).not.toContain("192.168.1.5");
      expect(offer.sdp).toContain("203.0.113.7");
      expect(offer.sdp).toContain("a=end-of-candidates");
      for (const address of [
        "10.0.0.2",
        "172.20.1.1",
        "100.64.0.1",
        "fe80::1",
        "fd00::5",
        "::ffff:7f00:1",
      ])
        r.gathered({ candidate: line(address), sdpMid: "0", sdpMLineIndex: 0 });
      r.gathered({ candidate: line("198.51.100.4"), sdpMid: "0", sdpMLineIndex: 0 });
      expect(r.sent.filter((m) => m.type === "ice").map((m) => (m as { candidate: { candidate: string } }).candidate.candidate)).toEqual([
        line("198.51.100.4"),
      ]);
      for (const address of [
        "169.254.169.254",
        "192.168.1.5",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
        "abcd.local",
        "metadata.internal",
      ])
        await r.ice({ candidate: line(address), sdpMid: "0", sdpMLineIndex: 0 });
      await r.ice({ candidate: line("203.0.113.9"), sdpMid: "0", sdpMLineIndex: 0 });
      await r.ice({ candidate: "garbage" });
      expect(r.dialled).toEqual([{ candidate: line("203.0.113.9"), sdpMid: "0", sdpMLineIndex: 0 }]);
    } finally {
      await r.g.close();
    }
  });
  it("refuses the 33rd remote candidate of one session", async () => {
    const r = await paired(true);
    try {
      for (let i = 0; i < 32; i++) await r.ice({ candidate: line(`203.0.113.${i}`), sdpMid: "0", sdpMLineIndex: 0 });
      await expect(r.ice({ candidate: line("203.0.113.200"), sdpMid: "0", sdpMLineIndex: 0 })).rejects.toThrow("ICE_LIMIT");
      expect(r.dialled).toHaveLength(32);
    } finally {
      await r.g.close();
    }
  });
  it("in loopback development keeps private candidates (two peers on one host)", async () => {
    const r = await paired(true);
    try {
      await r.ice({ candidate: line("192.168.1.5"), sdpMid: "0", sdpMLineIndex: 0 });
      r.gathered({ candidate: line("10.0.0.2"), sdpMid: "0", sdpMLineIndex: 0 });
      expect(r.dialled).toHaveLength(1);
      expect(r.sent.filter((m) => m.type === "ice")).toHaveLength(1);
      expect((r.sent.find((m) => m.type === "offer") as { sdp: string }).sdp).toContain("192.168.1.5");
    } finally {
      await r.g.close();
    }
  });
  it("in production filters the page's answer like a trickled candidate, and counts its lines into the cap", async () => {
    const sdp = (addresses: string[]) =>
      ["v=0", ...addresses.map((a) => `a=${line(a)}`), "a=end-of-candidates", ""].join("\r\n");
    const filtered = await paired(false, sdp(["169.254.169.254", "10.0.0.2", "203.0.113.5"]));
    try {
      expect(filtered.answerError).toBeUndefined();
      expect(filtered.answered).toHaveLength(1);
      expect(filtered.answered[0]).not.toContain("169.254.169.254");
      expect(filtered.answered[0]).not.toContain("10.0.0.2");
      expect(filtered.answered[0]).toContain("203.0.113.5");
      expect(filtered.answered[0]).toContain("a=end-of-candidates");
      // Three answer lines spent: 29 trickled candidates reach the cap, the 30th is refused.
      for (let i = 0; i < 29; i++) await filtered.ice({ candidate: line(`203.0.113.${i}`), sdpMid: "0", sdpMLineIndex: 0 });
      await expect(filtered.ice({ candidate: line("203.0.113.200"), sdpMid: "0", sdpMLineIndex: 0 })).rejects.toThrow(
        "ICE_LIMIT",
      );
    } finally {
      await filtered.g.close();
    }
    const flooded = await paired(
      false,
      sdp(["169.254.169.254", ...Array.from({ length: 33 }, (_, i) => `203.0.113.${i}`)]),
    );
    try {
      expect(flooded.answerError?.message).toBe("ICE_LIMIT");
      expect(flooded.answered).toEqual([]);
    } finally {
      await flooded.g.close();
    }
  });
  it("in production masks a server-reflexive candidate's related address in the offer and in trickle", async () => {
    const r = await paired(false);
    try {
      const offer = (r.sent.find((m) => m.type === "offer") as { sdp: string }).sdp;
      expect(offer).toContain(`a=${srflx("203.0.113.8", "0.0.0.0").replace("rport 50000", "rport 9")}`);
      expect(offer).not.toContain("192.168.1.5");
      r.gathered({ candidate: srflx("198.51.100.4", "10.0.0.2"), sdpMid: "0", sdpMLineIndex: 0 });
      r.gathered(srflx("198.51.100.5", "172.20.1.1"));
      const trickled = r.sent.filter((m) => m.type === "ice").map((m) => (m as { candidate: unknown }).candidate);
      expect(trickled).toEqual([
        { candidate: srflx("198.51.100.4", "0.0.0.0").replace("rport 50000", "rport 9"), sdpMid: "0", sdpMLineIndex: 0 },
        srflx("198.51.100.5", "0.0.0.0").replace("rport 50000", "rport 9"),
      ]);
    } finally {
      await r.g.close();
    }
  });
  // werift reads field 4 of value.split(" "): any other separator makes it dial a different host than the one checked.
  const hostile = {
    tab: "candidate:1 1 udp 1\t203.0.113.5 169.254.169.254 80 typ host",
    NBSP: "candidate:1 1 udp 1\u00a0203.0.113.5 169.254.169.254 80 typ host",
    "double space": "candidate:1 1  udp 169.254.169.254 203.0.113.5 typ host",
  };
  it.each(Object.entries(hostile))("in production drops an answer line werift would read differently (%s)", async (_, candidate) => {
    const r = await paired(false, ["v=0", `a=${candidate}`, "a=end-of-candidates", ""].join("\r\n"));
    try {
      expect(r.answerError).toBeUndefined();
      expect(r.answered).toHaveLength(1);
      expect(r.answered[0]).not.toContain("169.254.169.254");
      expect(r.answered[0]).toContain("a=end-of-candidates");
    } finally {
      await r.g.close();
    }
  });
  it.each(Object.entries(hostile))("in production does not dial a trickled candidate werift would read differently (%s)", async (_, candidate) => {
    const r = await paired(false);
    try {
      await r.ice({ candidate, sdpMid: "0", sdpMLineIndex: 0 });
      await r.ice(candidate);
      expect(r.dialled).toEqual([]);
    } finally {
      await r.g.close();
    }
  });
  // A related-address keyword in a fixed field (3 here) is not an option to werift, which reads options from field 8
  // in pairs: masking the page's answer by text would rewrite the host werift dials (field 4) to the box itself.
  const keywordInField = {
    raddr: "candidate:1 1 udp raddr 203.0.113.5 80 typ host",
    rport: "candidate:1 1 udp rport 203.0.113.5 80 typ host",
  };
  it.each(Object.entries(keywordInField))(
    "in production never rewrites the host of the page's answer line (%s in field 3)",
    async (_, candidate) => {
      const r = await paired(false, ["v=0", `a=${candidate}`, "a=end-of-candidates", ""].join("\r\n"));
      try {
        expect(r.answerError).toBeUndefined();
        expect(r.answered).toHaveLength(1);
        expect(r.answered[0]).not.toContain("0.0.0.0 80");
        expect(r.answered[0]).not.toContain(" 9 80 typ host");
        expect(r.answered[0]).toContain("a=end-of-candidates");
      } finally {
        await r.g.close();
      }
    },
  );
  it("in production the box's own masked offer line still passes the candidate filter", async () => {
    const r = await paired(false);
    try {
      const offer = (r.sent.find((m) => m.type === "offer") as { sdp: string }).sdp;
      const masked = offer.split("\r\n").find((l) => l.includes(" typ srflx "));
      expect(masked).toBe(`a=${srflx("203.0.113.8", "0.0.0.0").replace("rport 50000", "rport 9")}`);
      expect(publicCandidate(masked!.slice(2))).toBe(true);
    } finally {
      await r.g.close();
    }
  });
  // Round 5: the filter is an allowlist. Multicast (werift would dgram.send STUN to the LAN group), NAT64, 6to4 and a
  // zoned address (Node's isIPv6 accepts `%zone`, BlockList strips it, werift resolves a `.local` host by mDNS).
  const notPublic = {
    "IPv4 multicast (SSDP)": "239.255.255.250",
    "IPv6 multicast (all nodes)": "ff02::1",
    "NAT64 (64:ff9b::/96)": "64:ff9b::a00:1",
    "6to4 (2002::/16)": "2002:a00:1::1",
    "a zone naming an mDNS host": "2001:db8::1%x.local",
  };
  it.each(Object.entries(notPublic))("in production drops a non-public answer line and trickled candidate (%s)", async (_, address) => {
    const r = await paired(false, ["v=0", `a=${line(address)}`, "a=end-of-candidates", ""].join("\r\n"));
    try {
      expect(r.answerError).toBeUndefined();
      expect(r.answered).toHaveLength(1);
      expect(r.answered[0]).not.toContain(address);
      expect(r.answered[0]).toContain("a=end-of-candidates");
      await r.ice({ candidate: line(address), sdpMid: "0", sdpMLineIndex: 0 });
      await r.ice(line(address));
      expect(r.dialled).toEqual([]);
    } finally {
      await r.g.close();
    }
  });
  it("in production refuses every range outside the allowlist, read by the one filter", () => {
    for (const address of [
      "224.0.0.251",
      "239.255.255.250",
      "240.0.0.1",
      "255.255.255.255",
      "198.18.0.1",
      "198.19.255.254",
      "192.0.0.9",
      "::ffff:203.0.113.5",
      "ff02::1",
      "ff0e::fb",
      "64:ff9b::a00:1",
      "64:ff9b::cb00:7105",
      "2002:cb00:7105::1",
      "2001::1",
      "2001:0:ffff::1",
      "2001:db8::1%x.local",
      "2001:db8::1%eth0",
      "fe80::1%1",
      "4000::1",
      "100::1",
    ])
      expect([address, publicCandidate(line(address))]).toEqual([address, false]);
    for (const address of ["203.0.113.5", "198.51.100.4", "2001:db8::1", "2600:1f18::1", "2001:1::1", "3fff:ffff::1"])
      expect([address, publicCandidate(line(address))]).toEqual([address, true]);
  });
  it("2001:db8::/32 and 2600:1f18::/32 are inside 2000::/3 and outside Teredo's 2001::/32 (checked, not assumed)", () => {
    const unicast = new BlockList(),
      teredo = new BlockList(),
      sixToFour = new BlockList();
    unicast.addSubnet("2000::", 3, "ipv6");
    teredo.addSubnet("2001::", 32, "ipv6");
    sixToFour.addSubnet("2002::", 16, "ipv6");
    for (const address of ["2001:db8::1", "2600:1f18::1"]) {
      expect(unicast.check(address, "ipv6")).toBe(true);
      expect(teredo.check(address, "ipv6")).toBe(false);
      expect(sixToFour.check(address, "ipv6")).toBe(false);
    }
    expect(teredo.check("2001::1", "ipv6")).toBe(true);
  });
  it("in production keeps public IPv4 and IPv6 candidates in the answer and dials them trickled", async () => {
    const accepted = ["203.0.113.5", "2001:db8::1", "2600:1f18::1"];
    const r = await paired(false, ["v=0", ...accepted.map((a) => `a=${line(a)}`), "a=end-of-candidates", ""].join("\r\n"));
    try {
      expect(r.answerError).toBeUndefined();
      expect(r.answered).toHaveLength(1);
      for (const address of accepted) expect(r.answered[0]).toContain(`a=${line(address)}`);
      for (const address of accepted) await r.ice({ candidate: line(address), sdpMid: "0", sdpMLineIndex: 0 });
      expect(r.dialled).toEqual(accepted.map((a) => ({ candidate: line(a), sdpMid: "0", sdpMLineIndex: 0 })));
    } finally {
      await r.g.close();
    }
  });
  it("in loopback development still dials a private, a multicast and a zoned candidate (development unchanged)", async () => {
    const r = await paired(true);
    try {
      for (const address of ["192.168.1.5", "239.255.255.250", "2001:db8::1%x.local"])
        await r.ice({ candidate: line(address), sdpMid: "0", sdpMLineIndex: 0 });
      expect(r.dialled).toHaveLength(3);
    } finally {
      await r.g.close();
    }
  });
  it("in loopback development leaves the answer and related addresses as they are", async () => {
    const r = await paired(true, `v=0\r\na=${line("192.168.1.5")}\r\n`);
    try {
      expect(r.answered).toEqual([`v=0\r\na=${line("192.168.1.5")}\r\n`]);
      expect((r.sent.find((m) => m.type === "offer") as { sdp: string }).sdp).toContain("raddr 192.168.1.5 rport 50000");
    } finally {
      await r.g.close();
    }
  });
});
