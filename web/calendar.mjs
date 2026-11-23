const stamp=t=>new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const text=s=>String(s).replaceAll('\\','\\\\').replace(/\r?\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
function fold(line){let lines=[],part='',bytes=0;for(const ch of line){const size=new TextEncoder().encode(ch).length;if(bytes+size>74){lines.push(part);part=' ';bytes=1;}part+=ch;bytes+=size;}lines.push(part);return lines.join('\r\n');}
export function passCalendar(passes,config,now=Date.now()){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CoolCode//Satellite Pass//EN','CALSCALE:GREGORIAN'];
  for(const p of passes){
    lines.push('BEGIN:VEVENT','UID:'+config.target.omm.NORAD_CAT_ID+'-'+Math.round(p.start/1000)+'@coolcode.ca','DTSTAMP:'+stamp(now),'DTSTART:'+stamp(p.start),'DTEND:'+stamp(p.end),
      'SUMMARY:'+text(config.target.name+' pass · '+Math.round(p.peak.elevation)+'°'),
      'DESCRIPTION:'+text('Calculated pass above '+config.threshold+' degrees. Peak '+stamp(p.peak.time)+'. '+(p.visible?'Has a likely visible interval.':'No predicted visible interval.')+' Orbit epoch: '+config.target.omm.EPOCH+'. Recheck before observing; orbital predictions change.'),
      'LOCATION:'+text(config.lat+', '+config.lon),'URL:https://coolcode.ca/satpasses/','END:VEVENT');
  }
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
