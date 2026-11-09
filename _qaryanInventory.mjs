// Inventory: every page of alqaryangroup.com with its live <title>, meta description and H1
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
const app = initializeApp({ apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI", projectId: "whatanagent-a1e59" });
const db = getFirestore(app);
const seo = (await getDoc(doc(db, "appData", "seoAgent"))).data() || {};
const s = (seo.sites || {})["alqaryangroup.com"] || {};
const AUTH = "Basic " + Buffer.from(`${s.cmsUsername}:${s.cmsPassword}`).toString("base64");
const ROOT = "https://alqaryangroup.com";
const H = { Authorization: AUTH };

const pages = await (await fetch(ROOT + "/wp-json/wp/v2/pages?per_page=100&status=publish&_fields=id,slug,title,link", { headers: H })).json();
console.log("published pages:", pages.length, "\n");

const rows = [];
for (const p of pages) {
  let html = "";
  try { html = await (await fetch(p.link, { cache: "force-cache" })).text(); } catch { }
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [, ""])[1].replace(/&#8211;/g, "-").replace(/&amp;/g, "&");
  const desc = (html.match(/<meta name="description" content="([^"]*)"/i) || [, ""])[1].replace(/&amp;/g, "&");
  const clean = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const h1 = ((clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ""])[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  rows.push({ id: p.id, slug: p.slug, wpTitle: (p.title?.rendered || "").replace(/&#0?39;/g, "'").replace(/&amp;/g, "&"), title, desc, h1, link: p.link });
}

for (const r of rows) {
  console.log(`${r.id}  /${r.slug}/`);
  console.log(`   wp-title : ${r.wpTitle}`);
  console.log(`   <title>  : ${r.title}  (${r.title.length})`);
  console.log(`   desc     : ${r.desc ? r.desc.slice(0, 150) + (r.desc.length > 150 ? "…" : "") : "❌ NONE"}  (${r.desc.length})`);
  console.log(`   H1       : ${r.h1 || "❌ none"}`);
  console.log("");
}
process.exit(0);
