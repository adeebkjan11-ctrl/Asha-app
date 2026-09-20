import {KINDS,validDate,today} from '../web/domain.mjs';
export class ApiError extends Error {constructor(status,message,details){super(message);this.status=status;this.details=details;}}
export const fail=(message,status=400,details)=>{throw new ApiError(status,message,details);};
export function required(obj,key,max=200){if(typeof obj[key]!=='string'||!obj[key].trim()||obj[key].length>max)fail(`Please enter a valid ${key}.`);obj[key]=obj[key].trim();}
export function enumValue(obj,key,values){if(!values.includes(obj[key]))fail(`Invalid ${key}.`);}
export function date(obj,key,{required=false,future=true}={}){if(!obj[key]&&!required)return;if(!validDate(obj[key])||(!future&&obj[key]>today()))fail(`Please check ${key}.`);}
export function validateRecord(kind,d){
  if(!KINDS.includes(kind)||!d||typeof d!=='object'||Array.isArray(d))fail('Invalid record.');
  if(JSON.stringify(d).length>8_000_000)fail('Record is too large.',413);
  for(const [k,v] of Object.entries(d))if(typeof v==='string'&&k!=='content'&&v.length>12000)fail(`${k} is too long.`);
  if(kind==='household'){required(d,'name');required(d,'address',1500);required(d,'locality');}
  if(kind==='member'){
    required(d,'name');required(d,'householdId');enumValue(d,'sex',['Male','Female','Other','Unknown']);enumValue(d,'residence',['Resident','Temporary','Moved away','Deceased']);
    date(d,'dob',{future:false});date(d,'registeredOn',{required:true,future:false});
    if(d.dob&&d.estimatedAge!==' '&&d.estimatedAge!=null&&d.estimatedAge!=='')d.estimatedAge='';
    if(!d.dob&&d.estimatedAge!==''&&d.estimatedAge!=null){if(!Number.isInteger(Number(d.estimatedAge))||Number(d.estimatedAge)<0||Number(d.estimatedAge)>125)fail('Estimated age must be between 0 and 125.');date(d,'ageRecordedOn',{required:true,future:false});}
    if(d.abha&&!/^\d{14}$/.test(d.abha.replaceAll('-','').replaceAll(' ','')))fail('ABHA must have 14 digits.');
    if(d.abha)d.abha=d.abha.replaceAll('-','').replaceAll(' ','');
  }
  if(kind==='pregnancy'){required(d,'memberId');enumValue(d,'status',['Active','Delivered','Miscarriage','Stillbirth','Other outcome']);date(d,'lmp',{future:false});date(d,'edd');date(d,'registeredOn',{required:true,future:false});if(d.edd&&d.lmp&&d.edd<d.lmp)fail('Expected delivery must follow the last menstrual period.');}
  if(kind==='condition'){required(d,'memberId');required(d,'name');enumValue(d,'status',['Suspected','Self-reported','Confirmed','Resolved']);date(d,'date',{required:true,future:false});required(d,'source',1000);}
  if(kind==='visit'){required(d,'memberId');required(d,'program');date(d,'dueDate',{required:true});enumValue(d,'status',['Planned','Completed','Attempted','Declined','Transferred','Cancelled']);date(d,'actualDate',{future:false});if(['Completed','Attempted'].includes(d.status)&&!d.actualDate)fail('An actual visit date is required.');if(d.status==='Cancelled'&&!d.notes?.trim())fail('Please record a cancellation reason.');if(d.checklist&&!Array.isArray(d.checklist))fail('Invalid checklist.');}
  if(kind==='event'){required(d,'memberId');enumValue(d,'type',['Birth','Death','Arrival','Departure']);enumValue(d,'status',['Reported','Confirmed','Voided']);date(d,'date',{required:true,future:false});required(d,'source',1000);}
  if(kind==='document'){
    required(d,'memberId');required(d,'name');enumValue(d,'mime',['application/pdf','image/jpeg','image/png','image/webp']);required(d,'category');
    if(d.content){const b=Buffer.from(d.content,'base64');if(b.length>5*1024*1024)fail('Files must be 5 MB or smaller.',413);const ok=(d.mime==='application/pdf'&&b.subarray(0,5).toString()==='%PDF-')||(d.mime==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(d.mime==='image/jpeg'&&b[0]===255&&b[1]===216)||(d.mime==='image/webp'&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP');if(!ok)fail('The file contents do not match the selected file type.');d.size=b.length;}
  }
  if(kind==='schedule'){required(d,'name');required(d,'program');required(d,'approvedBy');required(d,'source',1500);date(d,'effectiveDate',{required:true});enumValue(d,'unit',['days','months']);if(!Array.isArray(d.offsets)||!d.offsets.length||d.offsets.length>50||d.offsets.some(n=>!Number.isInteger(n)||n<0||n>1200))fail('Enter valid visit offsets.');d.offsets=[...new Set(d.offsets)].sort((a,b)=>a-b);d.active=d.active===true;}
  if(kind==='report'){required(d,'name');if(!/^\d{4}-\d{2}$/.test(d.month))fail('Select a report month.');enumValue(d,'status',['Draft','Submitted','Accepted','Returned']);if(!d.snapshot||typeof d.snapshot!=='object')fail('Missing report snapshot.');}
  return d;
}
