import {chromium} from 'playwright';
import {createApp} from '../server/app.mjs';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const temp=mkdtempSync(path.join(tmpdir(),'asha-ui-'));
const app=createApp({directory:temp,setupToken:'ui-test-only-token'});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}`;
mkdirSync('artifacts',{recursive:true});
const launchBrowser=()=>chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chromium'}),args:['--no-sandbox','--disable-dev-shm-usage',...JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS||'[]')]});
let browser=await launchBrowser();
const results=[],errors=[];
let page;
async function step(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name);}
const action=(name)=>page.locator(`[data-action="${name}"]`).filter({visible:true}).first();
async function modalFill(name,value){await page.locator(`#modal [name="${name}"]`).fill(value);}
async function saveForm(){await page.locator('#record-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);}
try{
 page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await step('Demo opens with derived population totals',async()=>{await action('demo').click();await page.locator('.stats').waitFor();assert.equal(await page.locator('.stat strong').first().textContent(),'18');await page.screenshot({path:'artifacts/01-desktop-overview.png',fullPage:true});});
 await step('Create a family and member through the interface',async()=>{
  await action('add-household').click();await modalFill('name','UI Test Family');await modalFill('locality','Test Ward');await modalFill('address','1 Test Road');await saveForm();
  await action('add-member').click();await page.locator('#modal select[name="householdId"]').selectOption({label:'UI Test Family'});await modalFill('name','Test Child');await modalFill('dob','2025-01-15');await page.locator('#modal select[name="sex"]').selectOption('Female');await saveForm();
  assert.equal(await page.locator('.stat strong').first().textContent(),'19');
 });
 await step('Filters select the right children and member profiles open',async()=>{
  await action('nav-lists').click();await page.locator('[data-action="preset"][data-value="under5"]').click();assert.ok(await page.locator('table').textContent().then(s=>s.includes('Test Child')));await page.getByRole('button',{name:'Test Child',exact:true}).click();await page.locator('#modal h2').waitFor();assert.equal(await page.locator('#modal h2').textContent(),'Test Child');await action('close').click();
 });
 await step('Visit editing requires actual visit date and preserves outcome',async()=>{
  await action('nav-visits').click();await page.locator('[data-action="edit-visit"]').filter({hasText:'Open'}).first().click();await page.locator('#modal select[name="status"]').selectOption('Completed');await modalFill('actualDate','');await page.locator('#record-form button[type="submit"]').click();assert.ok(await page.locator('#form-error').textContent().then(s=>s.includes('actual date')));await modalFill('actualDate',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}));await modalFill('notes','Follow-up completed; outcome documented.');await saveForm();
 });
 await step('Monthly report CSV downloads and immutable draft snapshot is visible',async()=>{
  await action('nav-reports').click();const dl=page.waitForEvent('download');await action('export-report').click();assert.match((await dl).suggestedFilename(),/ASHA-Saathi-report/);await action('save-report').click();await saveForm();await action('open-report').click();assert.ok(await page.locator('#modal').textContent().then(s=>s.includes('resident Population')));await action('close').click();
 });
 await step('Mobile layout fits a 390px viewport and navigation works',async()=>{
  await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav [data-action="nav-home"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForFunction(()=>document.querySelector('#toasts').childElementCount===0);await page.screenshot({path:'artifacts/02-mobile-overview.png',fullPage:true});await page.locator('.mobile-nav [data-action="nav-households"]').click();assert.ok(await page.locator('h1').textContent().then(s=>s==='Families'));await page.screenshot({path:'artifacts/03-mobile-families.png',fullPage:true});
 });
 await browser.close();browser=await launchBrowser();
 await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setupToken:'ui-test-only-token',name:'Live Test Admin',username:'uiadmin',password:'Secure-ui-password-2026',area:'Test workspace'})});
 const context=await browser.newContext({viewport:{width:1400,height:1000}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await step('Live sign-in creates an encrypted offline workspace',async()=>{
  await page.locator('#login-form [name="username"]').fill('uiadmin');await page.locator('#login-form [name="password"]').fill('Secure-ui-password-2026');await page.locator('#login-form button[type="submit"]').click();await page.locator('#modal [name="offlinePassword"]').fill('Offline-test-password');await saveForm();assert.equal(await page.locator('.stat strong').first().textContent(),'0');
  const stored=await page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('asha-saathi-vault');q.onsuccess=()=>{const r=q.result.transaction('vault').objectStore('vault').get('current');r.onsuccess=()=>resolve(JSON.stringify(r.result));};}));assert.ok(!stored.includes('records'));assert.ok(stored.includes('"body"'));
 });
 await step('Administrator creates ASHA accounts and assigns a household',async()=>{
  await action('nav-team').click();await action('add-user').click();await modalFill('name','UI Worker');await modalFill('area','Test Ward');await modalFill('username','uiworker');await modalFill('password','Temporary-ui-pass-2026');await saveForm();
  await action('nav-households').click();await action('add-household').click();await modalFill('name','Live UI Family');await modalFill('locality','Ward 1');await modalFill('address','Private test address');await saveForm();await page.waitForFunction(()=>document.querySelector('#sync-button')?.textContent.trim()==='Sync'&&!document.querySelector('#sync-button').disabled);
 });
 await step('Offline changes survive reload and sync after reauthentication',async()=>{
  await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await action('add-household').click();await modalFill('name','Offline UI Family');await modalFill('locality','Ward 2');await modalFill('address','Offline test address');await saveForm();await page.waitForTimeout(400);
  await page.reload();await action('unlock').click();await modalFill('password','Offline-test-password');await saveForm();await action('nav-households').click();assert.ok(await page.locator('.cards').textContent().then(s=>s.includes('Offline UI Family')));
  await context.setOffline(false);await action('lock').click();await page.locator('#login-form [name="username"]').fill('uiadmin');await page.locator('#login-form [name="password"]').fill('Secure-ui-password-2026');await page.locator('#login-form button[type="submit"]').click();await page.locator('#modal [name="offlinePassword"]').fill('Offline-test-password');await saveForm();await page.waitForFunction(()=>document.querySelector('#sync-button')?.textContent.trim()==='Sync'&&!document.querySelector('#sync-button').disabled);
  await action('nav-households').click();assert.ok(await page.locator('.cards').textContent().then(s=>s.includes('Offline UI Family')));
 });
 assert.deepEqual(errors,[]);console.log('All browser workflows passed.');
}catch(e){results.push({name:'Browser workflow',status:'failed',error:e.message});if(page)await page.screenshot({path:'artifacts/failure.png',fullPage:true}).catch(()=>{});throw e;}
finally{writeFileSync('artifacts/browser-results.json',JSON.stringify({results,pageErrors:errors},null,2));await browser.close();await app.close();rmSync(temp,{recursive:true,force:true});}
