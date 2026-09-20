import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ageOn,addMonths,validDate,population,matchesMember,toCSV,scheduleVisits,visitState} from '../web/domain.mjs';
const rec=(id,kind,data)=>({id,kind,data,ownerId:'asha-a',version:1,updatedAt:'2026-09-20T00:00:00Z'});
test('age changes on birthday and invalid or future dates remain unknown',()=>{
 assert.equal(ageOn('2021-09-21','2026-09-20'),4);assert.equal(ageOn('2021-09-20','2026-09-20'),5);assert.equal(ageOn('2027-01-01','2026-09-20'),null);assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);
});
test('calendar month offsets handle leap years and short months',()=>{assert.equal(addMonths('2024-01-31',1),'2024-02-29');assert.equal(addMonths('2025-01-31',1),'2025-02-28');});
test('population counts each resident once, includes unknown sex, and reflects confirmed vital events',()=>{
 const rows=[rec('m1','member',{name:'One',sex:'Male',dob:'2024-01-01',householdId:'h1',residence:'Resident'}),rec('m2','member',{name:'Two',sex:'Unknown',dob:'1940-01-01',householdId:'h1',residence:'Resident'}),rec('m3','member',{name:'Three',sex:'Female',dob:'1970-01-01',householdId:'h2',residence:'Resident'}),rec('c1','condition',{memberId:'m1',name:'Diabetes',status:'Confirmed'}),rec('c2','condition',{memberId:'m1',name:'Hypertension',status:'Confirmed'}),rec('e1','event',{memberId:'m3',type:'Death',date:'2026-09-01',status:'Confirmed'})];
 const p=population(rows,'2026-09-20');assert.equal(p.total,2);assert.equal(p.Male+p.Female+p.Other+p.Unknown,p.total);assert.equal(p.households,1);assert.equal(p.under5,1);assert.equal(p.over80,1);
 rows.at(-1).data.status='Voided';assert.equal(population(rows,'2026-09-20').total,3);
});
test('ABHA missing and confirmed condition filters do not imply medical verification',()=>{
 const m=rec('m','member',{name:'Person',dob:'1940-01-01',sex:'Female',residence:'Resident'}),c=rec('c','condition',{memberId:'m',name:'Diabetes',status:'Suspected'});
 assert.equal(matchesMember(m,[m,c],{condition:'Diabetes'}),false);c.data.status='Confirmed';assert.equal(matchesMember(m,[m,c],{condition:'Diabetes',abha:'missing',minAge:81},'2026-09-20'),true);
});
test('approved schedules are calendar based, versioned and deduplicated',()=>{
 const m=rec('m','member',{dob:'2026-01-31'}),s=rec('s','schedule',{approvedBy:'Local ANM',active:true,effectiveDate:'2026-01-01',unit:'months',offsets:[1,3],program:'HBYC'});
 let visits=scheduleVisits(m,s);assert.equal(visits[0].dueDate,'2026-02-28');assert.equal(visits[1].dueDate,'2026-04-30');assert.equal(scheduleVisits(m,s,visits.map((d,i)=>rec('v'+i,'visit',d))).length,0);s.data.active=false;assert.equal(scheduleVisits(m,s).length,0);
});
test('passing a scheduled date never completes a visit',()=>assert.equal(visitState(rec('v','visit',{dueDate:'2026-09-01',status:'Planned'}),'2026-09-20'),'Overdue'));
test('spreadsheet exports escape quotes and formula injection',()=>{const csv=toCSV([['=SUM(A1)','a"b','+123']]);assert.ok(csv.includes("'="));assert.ok(csv.includes('a""b'));assert.ok(csv.includes("'+123"));});
