import test from 'node:test';
import assert from 'node:assert/strict';
import {availableSprints,buildSprintSnapshot,publicationExport,sprintQuarter} from '../src/teamPublishing.js';
const features=[{id:'f1',feature_name:'Approved feature',workspace:'A',status:'build_in_progress',notes:'PRIVATE'}, {id:'f2',feature_name:'Future feature',workspace:'B'}];
const allocations=[{id:'a1',sprint:'26Q2S1',owner:'Dev A',days:2,stage:'Build',featureId:'f1',secret:'DRAFT'}, {id:'a2',sprint:'26Q2S2',owner:'Dev B',days:5,featureId:'f2'},{id:'a3',sprint:'26Q3S1',owner:'Dev C',days:4,featureId:'f2'}];
test('detects quarters and available sprints',()=>{assert.equal(sprintQuarter('26Q2S1'),'26Q2');assert.deepEqual(availableSprints(allocations,'26Q2'),['26Q2S1','26Q2S2']);});
test('snapshot excludes all unapproved sprint data and private fields',()=>{
 const p=buildSprintSnapshot({sprint:'26Q2S1',quarter:'26Q2',features,allocations,publishedAt:'2026-10-29T00:00:00Z'});
 const json=JSON.stringify(p);
 assert.equal(p.allocations.length,1);assert.equal(p.features.length,1);
 for(const text of ['PRIVATE','DRAFT','Future feature','Dev B','Dev C','26Q3S1','26Q2S2']) assert.equal(json.includes(text),false,text);
});
test('wrong quarter is rejected',()=>assert.throws(()=>buildSprintSnapshot({sprint:'26Q3S1',quarter:'26Q2',features,allocations}),/quarter/));
test('exports only approved snapshots of the selected quarter',()=>{
 const approved=buildSprintSnapshot({sprint:'26Q2S1',quarter:'26Q2',features,allocations,publishedAt:'2026-10-29T00:00:00Z'});
 const draft=buildSprintSnapshot({sprint:'26Q3S1',quarter:'26Q3',features,allocations,publishedAt:'2026-10-29T00:00:00Z'});
 const exported=publicationExport({'26Q2S1':approved,'26Q3S1':draft},'26Q2');
 assert.deepEqual(exported.sprints.map(x=>x.sprint),['26Q2S1']);
});
test('snapshot remains unchanged after source allocations mutate',()=>{
 const source=allocations.map(a=>({...a}));const p=buildSprintSnapshot({sprint:'26Q2S1',quarter:'26Q2',features,allocations:source,publishedAt:'2026-10-29T00:00:00Z'});source[0].days=99;assert.equal(p.allocations[0].days,2);
});
