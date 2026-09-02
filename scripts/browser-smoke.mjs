import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.LIVE_URL || "http://127.0.0.1:4173";
let server;
async function waitFor(url) { for (let i=0;i<60;i+=1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r)=>setTimeout(r,150)); } throw new Error(`Unable to reach ${url}`); }
if (!process.env.LIVE_URL) server = spawn(process.execPath,[resolve(root,"scripts/serve.mjs")],{cwd:root,stdio:"ignore"});

try {
  await waitFor(target);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless:true, args:["--enable-features=WebMCP,WebMCPTesting"] });
  const page = await browser.newPage({ viewport:{width:1440,height:1000} });
  const errors=[]; page.on("pageerror",(error)=>errors.push(error.message));
  // Browser lifecycle stays deterministic; npm run test:live separately probes production data.
  await page.route("https://world.openfoodfacts.org/**",async(route)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({count:2,products:[
    {code:"3168930003632",product_name:"Quaker Oats",brands:"Quaker",quantity:"800 g",ingredients_text:"100% oatmeal",allergens_tags:["en:gluten"],nutriscore_grade:"a",last_modified_t:1780104331,nutriments:{sugars_100g:1.1}},
    {code:"5000108478119",product_name:"Quaker White Oats",brands:"Quaker",quantity:"1 kg",ingredients_text:"100% oat flakes",allergens_tags:[],nutriscore_grade:"a",last_modified_t:1787248315,nutriments:{sugars_100g:1.1}}
  ]})}));
  await page.addInitScript(()=>{
    const registered=new Map();
    Object.defineProperty(Document.prototype,"modelContext",{configurable:true,get(){return{async registerTool(tool){if(registered.has(tool.name))throw new DOMException("Duplicate tool","InvalidStateError");registered.set(tool.name,tool)},async getTools(){return[...registered.values()]}}}});
    window.__registeredWebMCPTools=registered;
  });
  await page.goto(target,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.__labelRelay?.toolNames?.length===8);
  const registered=await page.evaluate(()=>[...window.__registeredWebMCPTools.values()].map((tool)=>({name:tool.name,description:tool.description,closed:tool.inputSchema?.additionalProperties===false,untrusted:tool.annotations?.untrustedContentHint===true})));
  if(registered.length!==8||!registered.every((t)=>t.closed))throw new Error("WebMCP registration contract failed.");
  const required=registered.find((t)=>t.name==="search_products");
  if(required?.description!=="Search the product catalog")throw new Error("Required search_products contract changed.");
  if(registered.some((t)=>/^(?:luna|approve|purchase|checkout)(?:_|$)/i.test(t.name)))throw new Error("Development or authority tool leaked into WebMCP.");

  await page.waitForSelector("#product-list .product-card",{timeout:30000});
  const liveState=await page.evaluate(()=>window.__labelRelay.getState().search);
  if(!liveState?.live||liveState.source!=="Open Food Facts"||!liveState.fetchedAt)throw new Error("Browser did not receive provenance-rich API-shaped data.");
  const ids=liveState.results.slice(0,2).map((product)=>product.id);
  await page.evaluate(async(productIds)=>window.__registeredWebMCPTools.get("compare_products").execute({productIds},{}),ids);
  await page.evaluate(async(productId)=>window.__registeredWebMCPTools.get("stage_verified_choice").execute({productId,rationale:"Most complete live record; physical verification remains required."},{}),ids[0]);
  const id=ids[0];
  for(const [type,note] of [["barcode_match",`Printed barcode ${id} matches.`],["ingredients_match","The first ingredients on the package match the displayed record."]]){
    await page.locator("#check-product").selectOption(id);
    await page.locator("#check-type").selectOption(type);
    await page.locator("#check-outcome").selectOption("match");
    await page.locator("#check-note").fill(note);
    await page.locator("#check-form button[type=submit]").click();
  }
  await page.locator("#approval-checkbox").check();
  await page.locator("#approve-button").click();
  const approved=JSON.parse(await page.evaluate(()=>window.__registeredWebMCPTools.get("get_approved_choice").execute({},{})));
  if(!approved.approved||approved.choice.status!=="human_approved")throw new Error("Trusted human approval did not become agent-readable.");
  if(errors.length)throw new Error(`Page errors: ${errors.join(" | ")}`);
  await mkdir(resolve(root,"reports"),{recursive:true});
  await page.screenshot({path:resolve(root,"reports/browser-smoke.png"),fullPage:true});
  console.log(JSON.stringify({passed:true,target,registeredTools:registered.length,liveSource:liveState.source,fetchedAt:liveState.fetchedAt,sampleProduct:liveState.results[0].name,approvedBy:"human",runtimeErrors:errors},null,2));
  await browser.close();
} finally { server?.kill("SIGTERM"); }
