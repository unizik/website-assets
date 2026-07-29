"use strict";window.renderCalendar=function(u,e=[]){const g=document.getElementById(u);if(g){const y=new Date;let v=y.getFullYear(),p=y.getMonth();const b=new Map,m=(e.forEach(e=>{b.has(e.date)||b.set(e.date,e)}),["Su","Mo","Tu","We","Th","Fr","Sa"]),h=["January","February","March","April","May","June","July","August","September","October","November","December"],f=e=>String(e).padStart(2,"0");!function e(){var t,a=new Date(v,p,1).getDay(),n=new Date(v,p+1,0).getDate(),s=m.map(e=>`<span class="ec-weekday">${e}</span>`).join("");let d="";for(let e=0;e<a;e++)d+='<span class="ec-day other-month"></span>';for(let e=1;e<=n;e++){l=v,o=p,r=e;var l=`${l}-${f(o+1)}-`+f(r),o=b.get(l),r=["ec-day",(r=v,l=p,t=e,r===y.getFullYear()&&l===y.getMonth()&&t===y.getDate()?"today":""),o?"has-event":""].filter(Boolean).join(" "),l=o?`data-event-url="${encodeURI(o.url??"")}" data-event-title="${o.title?.replace(/"/g,"&quot;")??""}" tabindex="0"`:"";d+=`<span class="${r}" ${l}>${e}</span>`}var c=u+"-tooltip";g.innerHTML=`
      <div class="events-calendar" role="region" aria-label="Events calendar">
        <div class="ec-header">
          <button class="ec-nav-btn" id="${u}-prev" aria-label="Previous month">&#8249;</button>
          <span class="ec-month-label" aria-live="polite">
            ${h[p]} ${v}
          </span>
          <button class="ec-nav-btn" id="${u}-next" aria-label="Next month">&#8250;</button>
        </div>
        <div class="ec-weekdays" aria-hidden="true">${s}</div>
        <div class="ec-days" id="${u}-days" role="grid">${d}</div>
        <div class="ec-legend">
          <span class="ec-legend-item">
            <span class="ec-legend-dot" style="background:var(--orange)"></span>Today
          </span>
          <span class="ec-legend-item">
            <span class="ec-legend-dot" style="background:var(--blue)"></span>Event
          </span>
        </div>
        <div id="${c}" class="ec-tooltip" role="tooltip" style="display:none;position:absolute;z-index:200;background:var(--dark,#0F1433);color:#fff;font-size:12px;padding:6px 10px;border-radius:4px;max-width:200px;pointer-events:none;"></div>
      </div>
    `,document.getElementById(u+"-prev")?.addEventListener("click",()=>{--p<0&&(p=11,--v),e()}),document.getElementById(u+"-next")?.addEventListener("click",()=>{11<(p+=1)&&(p=0,v+=1),e()});const i=document.getElementById(c);s=document.getElementById(u+"-days");s?.addEventListener("click",e=>{(e=(e=e.target.closest(".ec-day.has-event"))&&decodeURI(e.dataset.eventUrl??""))&&(window.location.href=e)}),s?.addEventListener("keydown",e=>{var t;"Enter"!==e.key&&" "!==e.key||(t=e.target.closest(".ec-day.has-event"))&&(e.preventDefault(),e=decodeURI(t.dataset.eventUrl??""))&&(window.location.href=e)}),s?.addEventListener("mouseover",e=>{var t;(e=e.target.closest(".ec-day.has-event"))&&i&&(i.textContent=e.dataset.eventTitle??"",i.style.display="block",e=e.getBoundingClientRect(),t=g.getBoundingClientRect(),i.style.top=e.bottom-t.top+6+"px",i.style.left=e.left-t.left+"px")}),s?.addEventListener("mouseout",e=>{!e.target.closest(".ec-day.has-event")&&i&&(i.style.display="none")})}()}};