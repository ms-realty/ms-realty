"""Exercise alert management through an isolated local server and its actual bundles.

Run with /usr/bin/python3; set NODE if Node22 is not on PATH. No live request
or customer message is sent. All ledgers and screenshots use temporary paths.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
SERVER="""
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHttpApp} from './production/lib/http.mjs';
import {createNodeServer,listen} from './production/lib/node-server.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'msr-alerts-ledgers-'));
const keys=['leadLedgerPath','publicContactVaultPath','languageRequestPath','savedSearchLedgerPath','savedSearchManageEventLedgerPath','savedSearchAlertDeliveryLedgerPath','publicRequestOutcomeLedgerPath','consentLedgerPath','eventLedgerPath','auditLogPath'];
const paths=Object.fromEntries(keys.map(key=>{const p=path.join(dir,key+'.jsonl');fs.writeFileSync(p,'');return[key,p]}));
const app=createHttpApp({...paths,publicContactKey:'isolated-alerts-browser-vault-000001',savedSearchManageSecret:'isolated-alerts-browser-secret-000001',savedSearchManageLinkTemplate:'/{locale}/alerts',savedSearchManageLinkTtlDays:30,savedSearchPublicOrigin:'http://127.0.0.1:3196'});
const server=createNodeServer(app);
const address=await listen(server,0,'127.0.0.1');
console.log(JSON.stringify({port:address.port,isolated_ledgers:dir}));
"""
process=subprocess.Popen([os.environ.get('NODE','node'),'--input-type=module','-e',SERVER],cwd=ROOT,stdout=subprocess.PIPE,text=True)
config=json.loads(process.stdout.readline())
base=f"http://127.0.0.1:{config['port']}"
out=Path(os.environ.get('MS_REALTY_TEST_OUTPUT') or tempfile.mkdtemp(prefix='msr-alerts-browser-'))
out.mkdir(exist_ok=True)
try:
    rows=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        for locale in ['en','he']:
            for width in [1440,390]:
                for theme in ['light','dark']:
                    c=browser.new_context(viewport={'width':width,'height':1000},color_scheme=theme)
                    page=c.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.goto(base+'/'+locale+'/alerts',wait_until='domcontentloaded');expect(page.locator('[data-alerts-empty]')).to_be_visible()
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    page.goto(base+'/'+locale+'/alerts?token=invalid',wait_until='domcontentloaded');expect(page.locator('[data-alerts-link-invalid]')).to_be_visible()
                    r=c.request.post(base+'/api/saved-searches',data={'locale':locale,'query':'Sandanski','filters':{'property_type':'apartment'},'contact':{'name':'Browser check','email':f'check-{locale}-{width}-{theme}@example.test','phone':'+359880000002'},'contactPreference':'email','alertConsent':True,'alertFrequency':'weekly'})
                    assert r.status==201,(r.status,r.text()); data=r.json(); token=data['manage']['token']
                    page.goto(base+data['manage']['path'],wait_until='domcontentloaded');expect(page.locator('[data-alerts-managed]')).to_be_visible()
                    expect(page.locator('[data-alerts-empty]')).to_be_hidden()
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    small=page.locator('main a,main button,main select').evaluate_all('(xs)=>xs.filter(e=>e.getClientRects().length&&!e.disabled).filter(e=>e.getBoundingClientRect().height<43.5).map(e=>({text:e.textContent.slice(0,50),height:e.getBoundingClientRect().height}))')
                    assert not small,small
                    page.screenshot(path=str(out/f'alerts-{locale}-{width}-{theme}.png'),full_page=True)
                    page.locator('[data-alert-action="pause"]').click();expect(page.locator('[data-alert-status]')).to_have_attribute('data-state','paused')
                    page.reload(wait_until='domcontentloaded');expect(page.locator('[data-alert-status]')).to_have_attribute('data-state','paused')
                    page.locator('[data-alert-action="resume"]').click();expect(page.locator('[data-alert-status]')).to_have_attribute('data-state','active')
                    page.locator('[data-alert-frequency-select]').select_option('daily');expect(page.locator('[data-alert-feedback]')).to_have_attribute('data-state','saved')
                    r=c.request.get(base+'/api/saved-searches/manage',params={'token':token});assert r.json()['saved_search']['alert_frequency']=='daily'
                    page.on('dialog',lambda d:d.accept());page.locator('[data-alert-action="delete"]').click()
                    expect(page.locator('[data-alerts-managed]')).to_be_hidden()
                    expect(page.locator('[data-alert-feedback]')).to_be_visible()
                    assert c.request.get(base+'/api/saved-searches/manage',params={'token':token}).status==404
                    assert not errors,errors
                    rows.append({'locale':locale,'width':width,'theme':theme,'persisted_pause_resume_frequency_delete':True});c.close()
        browser.close()
    (out/'report.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'passed':len(rows),'evidence':str(out)}))
finally:
    process.terminate()
    process.wait(timeout=10)
    shutil.rmtree(config['isolated_ledgers'])
