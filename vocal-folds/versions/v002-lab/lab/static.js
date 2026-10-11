// 下面と内側の面に一様な圧 Ps をかけたときの静的なたわみ（中央の断面の内側の面の下・中・上）
const F=require('./fem.js');
function run(gopt,mat,Ps){
 const g=F.defaultGeom(gopt);const mesh=F.buildMesh(g);F.markLayers(mesh);
 const sys=F.assemble(mesh,mat);
 const surf=F.surfaceData(mesh,sys,[]);
 const f=new Float64Array(sys.n);
 // 圧: 上面以外（y < T の面）に Ps
 for(let ii=0;ii<surf.nodes;ii++){ if(surf.pos[3*ii+1]>g.T-1e-9 && !(surf.pos[3*ii]<1e-9)) continue;}
 const nodes=[];{const {nI,nJ,nK,id}=mesh;for(let k=0;k<nK;k++){for(let i=nI-1;i>=1;i--)nodes.push(id(i,0,k));for(let j=0;j<nJ;j++)nodes.push(id(0,j,k));for(let i=1;i<nI;i++)nodes.push(id(i,nJ-1,k));}}
 const uniq=[...new Set(nodes)];
 uniq.forEach((a,ii)=>{const isSup=(((a/mesh.nI)|0)%mesh.nJ)===mesh.nJ-1&&(a%mesh.nI)>0; if(isSup)return; for(let d=0;d<3;d++){const q=sys.dofOf[3*a+d];if(q>=0)f[q]+=-Ps*surf.area[3*ii+d];}});
 const L=sys.K.slice();F.bandCholesky(L,sys.W,sys.n);const u=new Float64Array(sys.n);F.bandSolve(L,sys.W,sys.n,f,u);
 const k=(mesh.nK-1)/2;const out=[];for(const j of [0,(mesh.nJ-1)/2,mesh.nJ-1]){const a=mesh.id(0,j,k);out.push([0,1].map(d=>{const q=sys.dofOf[3*a+d];return (u[q]*1e3).toFixed(3)}).join(','));}
 return 'n='+sys.n+' medial(lower,mid,upper) ux,uy mm: '+out.join(' | ');
}
const mat={rho:1030,cover:{Et:4e3,Gap:10e3,nuAP:0.495}};mat.body=mat.cover;
for(const r of JSON.parse(process.argv[2])) console.log(JSON.stringify(r),run(Object.assign({T:3e-3},r.g),r.m?Object.assign({},mat,{cover:Object.assign({},mat.cover,r.m),body:Object.assign({},mat.cover,r.m)}):mat,800));
