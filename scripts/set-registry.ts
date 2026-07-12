// scripts/set-registry.ts
import { redis } from "../src/lib/redis";

const registry = [
  {
    key: "de", label: "Germany", flag: "ð©ðª", enabled: true, priority: 0,
    source: "static", address: "178.20.209.40", port: 8443,
    serverName: "yahoo.com",
    publicKey: "-uD0vTL4K_PSOAF-uFOcVVxFi7GUD5K8gaPGf2Ng4R0",
    shortId: "4347a2ae95bc4dd0", spiderX: "/", fingerprint: "firefox",
    encryption: "none", flow: "xtls-rprx-vision",
  },
  {
    key: "uk", label: "United Kingdom", flag: "ð¬ð§", enabled: true, priority: 1,
    source: "static", address: "62.60.155.34", port: 9443,
    serverName: "yahoo.com",
    publicKey: "t1SFPoUhF2NYAOKUKuZfysM--qt078UA_YaDPVxrHBg",
    shortId: "8f845d626ab7f9fc", spiderX: "/", fingerprint: "firefox",
    encryption: "none", flow: "xtls-rprx-vision",
  },
  {
    key: "ams", label: "Netherlands", flag: "ð³ð±", enabled: true, priority: 2,
    source: "static", address: "89.124.98.58", port: 9443,
    serverName: "yahoo.com",
    publicKey: "E7im0s2-72o6lHom7WwSb-HbQ5epolu-47lIOBQPXXk",
    shortId: "bd9844626d876649", spiderX: "/", fingerprint: "firefox",
    encryption: "none", flow: "xtls-rprx-vision",
  },
  {
    key: "kz", label: "Kazakhstan", flag: "🇰🇿", enabled: true, priority: 3,
    source: "static", address: "38.180.38.191", port: 8443,
    serverName: "yahoo.com",
    publicKey: "8a0-e-JwLi4sVYVz7fyngmPOl-R5kVeL1Hdas4JkCn4",
    shortId: "70b033bd1f2c0141", spiderX: "/", fingerprint: "firefox",
    encryption: "none", flow: "xtls-rprx-vision",
  },
];

async function main() {
  await redis.set("inbounds:registry", JSON.stringify(registry));
  console.log("registry keys:", (JSON.parse((await redis.get("inbounds:registry")) as string) as any[]).map(e => e.key));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
