const F=require('./fem.js'),S=require('./sim.js'),M=require('./measure.js');
const cases=JSON.parse(process.argv[2]);const cache={};
for(const a of cases){
 const gk=JSON.stringify(a.g||{})+a.Gap+a.Gb+a.Et;
 const mat={cover:{Et:(a.Et||4)*1e3,Gap:(a.Gap||10)*1e3,nuAP:0.495}};
 mat.body=a.Gb?{Et:(a.Et||4)*1e3,Gap:a.Gb*1e3,nuAP:0.495}:mat.cover;
 const m=cache[gk]||(cache[gk]=F.buildModel(Object.assign({nX:4,nY:6,nZ:6,T:3e-3},a.g||{}),mat,a.nm||40));
 const t=Date.now();const r=S.makeSim(m,Object.assign({Ps:800},a.s||{})).run(a.dur||0.5);const o=M.measure(r,{from:(a.dur||0.5)/2});
 console.log(JSON.stringify(a),'f1',(m.omega[0]/2/Math.PI).toFixed(0),'->',o.phonate?('F0 '+o.F0.toFixed(0)+' CQ0 '+o.CQ0.toFixed(2)+' H1H2 '+o.H1H2.toFixed(1)):'no','Qmean',o.Qmean.toFixed(0),'Qac',o.Qac.toFixed(1),'SPL',o.SPL.toFixed(1),(Date.now()-t)+'ms');
}
