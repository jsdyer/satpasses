import test from 'node:test';import assert from 'node:assert/strict';
import {passCalendar} from '../web/calendar.mjs';
test('calendar has UTC events, safely escaped text and RFC-sized lines',()=>{
 const value=passCalendar([{start:0,end:60000,peak:{time:30000,elevation:43},visible:true}],{lat:49,lon:-123,threshold:10,target:{name:'ISS, station\nnext',omm:{NORAD_CAT_ID:25544,EPOCH:'2026-11-23'}}},0);
 assert.match(value,/DTSTART:19700101T000000Z/);assert.match(value,/DTEND:19700101T000100Z/);
 assert.match(value,/ISS\\, station\\nnext/);assert.equal((value.match(/BEGIN:VEVENT/g)||[]).length,1);
 assert.ok(value.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
});
