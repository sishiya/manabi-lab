'use strict';
// "about this app": opens from the dock button or "?", and once on a viewer's first visit
const ABOUT_SEEN='hito46.aboutSeen';
let aboutReturn=null;
function setAbout(open){
  const el=$('about');if(el.hidden===!open)return;
  el.hidden=!open;
  if(open){aboutReturn=document.activeElement;$('aboutStart').focus()}
  else{try{localStorage.setItem(ABOUT_SEEN,'1')}catch(e){}if(aboutReturn&&aboutReturn.focus)aboutReturn.focus()}
}
$('bAbout').onclick=()=>setAbout(true);
$('aboutClose').onclick=$('aboutStart').onclick=()=>setAbout(false);
$('about').addEventListener('click',e=>{if(e.target.id==='about')setAbout(false)});
addEventListener('keydown',e=>{
  if(!$('about').hidden){if(e.key==='Escape'){e.preventDefault();setAbout(false)}e.stopPropagation();return}
  if(e.key==='?'&&e.target.tagName!=='SELECT')setAbout(true);
},true);
{let seen=false;try{seen=localStorage.getItem(ABOUT_SEEN)==='1'}catch(e){}if(!seen)setAbout(true)}
