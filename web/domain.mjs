export const KINDS = ['household', 'member', 'pregnancy', 'condition', 'visit', 'event', 'document', 'schedule', 'report'];
export const CONDITIONS = ['Hypertension', 'Diabetes', 'Tuberculosis', 'Cancer', 'Asthma', 'Other'];
export const today = () => new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'});
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s; }
export function ageOn(dob, date = today()) {
  if (!validDate(dob) || !validDate(date) || dob > date) return null;
  const [y,m,d] = dob.split('-').map(Number), [Y,M,D] = date.split('-').map(Number);
  return Y-y-(M<m || (M===m && D<d) ? 1 : 0);
}
export function addDays(date, days) { const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+Number(days)); return d.toISOString().slice(0,10); }
export function addMonths(date, months) {
  const d=new Date(date+'T12:00:00Z'), day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+Number(months));
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,last)); return d.toISOString().slice(0,10);
}
export function memberAge(member, at=today()) {
  if (member.data.dob) return ageOn(member.data.dob, at);
  if (member.data.estimatedAge === '' || member.data.estimatedAge == null) return null;
  const elapsed = ageOn(member.data.ageRecordedOn || at, at);
  return Number(member.data.estimatedAge) + (elapsed ?? 0);
}
export function residence(member, records, at=today()) {
  const events=records.filter(r=>!r.deleted && r.kind==='event' && r.data.memberId===member.id && r.data.status==='Confirmed' && r.data.date<=at).sort((a,b)=>a.data.date.localeCompare(b.data.date)||a.updatedAt.localeCompare(b.updatedAt));
  if(events.some(r=>r.data.type==='Death')) return 'Deceased';
  const move=events.filter(r=>['Arrival','Departure'].includes(r.data.type)).at(-1);
  return move ? (move.data.type==='Departure'?'Moved away':'Resident') : (member.data.residence || 'Resident');
}
export function population(records, at=today()) {
  const members=records.filter(r=>r.kind==='member'&&!r.deleted&&(!r.data.dob||r.data.dob<=at)&&(!r.data.registeredOn||r.data.registeredOn<=at)&&residence(r,records,at)==='Resident');
  const bySex={Male:0,Female:0,Other:0,Unknown:0};
  for(const m of members) bySex[m.data.sex in bySex ? m.data.sex : 'Unknown']++;
  return {total:members.length, households:new Set(members.map(m=>m.data.householdId)).size, ...bySex,
    under5:members.filter(m=>memberAge(m,at)!==null&&memberAge(m,at)<5).length,
    over80:members.filter(m=>memberAge(m,at)!==null&&memberAge(m,at)>80).length,
    abhaMissing:members.filter(m=>!m.data.abha).length, members};
}
export function visitState(r, at=today()) { return r.data.status==='Planned' && r.data.dueDate<at ? 'Overdue' : r.data.status; }
export function matchesMember(m, records, filter={}, at=today()) {
  const d=m.data, age=memberAge(m,at), health=records.filter(r=>r.kind==='condition'&&!r.deleted&&r.data.memberId===m.id);
  if(filter.search && !`${d.name} ${d.phone||''} ${d.abha||''} ${m.id}`.toLowerCase().includes(filter.search.toLowerCase()))return false;
  if(filter.sex && d.sex!==filter.sex)return false;
  if(filter.minAge!==''&&filter.minAge!=null&&(age===null||age<Number(filter.minAge)))return false;
  if(filter.maxAge!==''&&filter.maxAge!=null&&(age===null||age>Number(filter.maxAge)))return false;
  if(filter.abha==='missing'&&d.abha)return false;
  if(filter.condition&&!health.some(c=>c.data.name===filter.condition&&c.data.status==='Confirmed'))return false;
  if(filter.residence&&residence(m,records,at)!==filter.residence)return false;
  if(filter.pregnant&&!records.some(r=>r.kind==='pregnancy'&&!r.deleted&&r.data.memberId===m.id&&r.data.status==='Active'))return false;
  if(filter.ownerId&&m.ownerId!==filter.ownerId)return false;
  return true;
}
export function csvCell(value) { let s=String(value??''); if(/^[\s]*[=+@-]/.test(s))s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }
export function toCSV(rows) { return '\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'); }
export function scheduleVisits(member, schedule, existing=[], anchor=member.data.dob) {
  if(!schedule.data.approvedBy||!schedule.data.active||!validDate(anchor))return [];
  return schedule.data.offsets.map(offset=>({program:schedule.data.program, dueDate:schedule.data.unit==='months'?addMonths(anchor,offset):addDays(anchor,offset), offset}))
    .filter(v=>v.dueDate>=schedule.data.effectiveDate&&!existing.some(e=>e.data.memberId===member.id&&e.data.scheduleId===schedule.id&&e.data.scheduleVersion===schedule.version&&e.data.offset===v.offset))
    .map(v=>({...v, memberId:member.id,status:'Planned',scheduleId:schedule.id,scheduleVersion:schedule.version,notes:'',checklist:[],actualDate:''}));
}
