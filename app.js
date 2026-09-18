const $=id=>document.getElementById(id);
let scanStream=null;
let photosByPoint={3:[],4:[],5:[],6:[],7:[]};
let checkAnswers={1:null,2:null,3:null,4:null,5:null,6:null,7:null};
let lastPdfBlob=null, lastPdfName='';

function isSecureCameraContext(){return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)}
function toast(msg){const t=$('toast');t.textContent=msg;t.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.style.display='none',3200)}
function val(id){return $(id).value.trim()}
function setv(id,v){$(id).value=v??''}

/* ============================================================
   EMPLOYEE PROFILE (localStorage-based, Version 1 — no server)
   ============================================================ */
const PROFILE_KEY='ultra_vcs_profile';
function loadProfile(){
  try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||'null')}catch(e){return null}
}
function saveProfileToStorage(name,id){
  try{localStorage.setItem(PROFILE_KEY, JSON.stringify({name,id}))}catch(e){}
}
function renderProfile(){
  const p=loadProfile();
  if(p && p.name && p.id){
    $('profileForm').classList.add('hidden');
    $('profileSaved').classList.remove('hidden');
    $('profileBadge').textContent='Saved on this device';
    $('profileSavedName').textContent=p.name;
    $('profileSavedId').textContent=p.id;
    setv('inspectorName',p.name);
    setv('inspectorId',p.id);
  }else{
    $('profileForm').classList.remove('hidden');
    $('profileSaved').classList.add('hidden');
    $('profileBadge').textContent='Not saved';
    setv('inspectorName','');
    setv('inspectorId','');
  }
}
$('saveProfile').onclick=()=>{
  const name=val('empName'), id=val('empId');
  if(!name||!id){toast('Please enter both Employee Name and Employee ID No.');return}
  saveProfileToStorage(name,id);
  renderProfile();
  toast('Profile saved on this device.');
};
$('editProfile').onclick=()=>{
  const p=loadProfile()||{};
  setv('empName',p.name||'');setv('empId',p.id||'');
  $('profileForm').classList.remove('hidden');
  $('profileSaved').classList.add('hidden');
};

/* ============================================================
   QR PARSING — same proven Route Card QR format as the
   ULTRA@503 Rework/Rejection app. WO / SAP Order / Material No.
   are intentionally never captured into the UI.
   ============================================================ */
function parseQR(raw){
  raw=(raw||'').replace(/^id\s*=\s*"[^"]*"\s*/i,'').trim();
  const p=raw.split('?').map(x=>x.replace(/^['"]|['"]$/g,'').trim());
  const msg=$('qrParseMsg');
  msg.classList.remove('hidden','ok','warn');
  if(p.length<10 || !p[3]){
    msg.classList.add('warn');
    msg.textContent='QR detected, but its format was not recognized. Please enter fields manually.';
    return false;
  }
  setv('partNo',p[3]);
  setv('poNo',p[7]);
  setv('poLine',p[8]);
  const unit=(p[14]||'NOS').trim();
  const poQty=(p[9]||'').trim();
  const totalQty=(p[13]||'').trim();
  setv('poQty', poQty ? `${poQty} ${unit}` : '');
  setv('heatNo',p[10]);
  setv('ucBatch',p[12]||p[11]||'');
  setv('totalQty', totalQty ? `${totalQty} ${unit}` : '');
  msg.classList.add('ok');
  msg.textContent='QR data parsed. Please verify the route-card fields.';
  toast('Route Card data loaded.');
  return true;
}

/* ============================================================
   QR SCANNER — reused approach from the ULTRA@503 Rework app:
   native BarcodeDetector first, jsQR fallback, rear camera,
   continuous detection, auto-stop on success.
   ============================================================ */
async function startScanner(){
  stopScanner();
  if(!isSecureCameraContext()){
    $('scanner').classList.remove('hidden');
    $('scanMsg').textContent='Live QR scanning requires the HTTPS GitHub Pages address. Please open the app from its HTTPS website.';
    $('mobileNotice').textContent='Please use the HTTPS ULTRA@503 website for QR scanning.';
    $('mobileNotice').classList.remove('hidden');
    return;
  }
  $('scanner').classList.remove('hidden');
  $('mobileNotice').classList.add('hidden');
  $('scanMsg').textContent='Starting rear camera…';
  try{
    scanStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{exact:'environment'},width:{ideal:1920},height:{ideal:1080},focusMode:{ideal:'continuous'}},
      audio:false
    });
  }catch(e){
    try{
      scanStream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},focusMode:{ideal:'continuous'}},audio:false
      });
    }catch(e2){
      $('scanMsg').textContent='Camera unavailable: '+e2.message;
      toast('Camera could not start. Allow camera permission in Chrome.');
      return;
    }
  }
  const v=$('video');
  v.setAttribute('playsinline','');
  v.muted=true;
  v.srcObject=scanStream;
  await v.play();
  try{
    const track=scanStream.getVideoTracks()[0];
    const caps=track.getCapabilities?track.getCapabilities():{};
    const advanced=[];
    if(caps.focusMode&&caps.focusMode.includes('continuous')) advanced.push({focusMode:'continuous'});
    if(caps.zoom&&caps.zoom.max>=1.5) advanced.push({zoom:Math.min(1.8,caps.zoom.max)});
    if(advanced.length) await track.applyConstraints({advanced});
  }catch(e){}
  $('scanMsg').textContent='Hold the Route Card QR inside the white box. Move closer until the QR fills most of the box. Keep the card steady for 1–2 seconds.';
  window.__scanBusy=false;
  requestAnimationFrame(scanLoop);
}

async function decodeScanFrame(v){
  if(!v.videoWidth||!v.videoHeight)return null;
  if('BarcodeDetector' in window){
    try{
      if(!window.__qrDetector) window.__qrDetector=new BarcodeDetector({formats:['qr_code']});
      const found=await window.__qrDetector.detect(v);
      if(found&&found.length&&found[0].rawValue)return found[0].rawValue;
    }catch(e){}
  }
  if(!window.jsQR)return null;
  const vw=v.videoWidth, vh=v.videoHeight;
  const c=$('scanCanvas');
  const ctx=c.getContext('2d',{willReadFrequently:true});
  const crops=[
    [Math.round(vw*.18),Math.round(vh*.12),Math.round(vw*.64),Math.round(vh*.76)],
    [Math.round(vw*.08),Math.round(vh*.08),Math.round(vw*.84),Math.round(vh*.84)],
    [0,0,vw,vh]
  ];
  for(const [sx,sy,sw,sh] of crops){
    const maxSize=1600;
    const scale=Math.min(2.5,maxSize/Math.max(sw,sh));
    c.width=Math.max(1,Math.round(sw*scale));
    c.height=Math.max(1,Math.round(sh*scale));
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(v,sx,sy,sw,sh,0,0,c.width,c.height);
    const img=ctx.getImageData(0,0,c.width,c.height);
    for(const inversionAttempts of ['attemptBoth','dontInvert']){
      const code=jsQR(img.data,img.width,img.height,{inversionAttempts});
      if(code&&code.data)return code.data;
    }
  }
  return null;
}
async function scanLoop(){
  if(!scanStream||$('scanner').classList.contains('hidden'))return;
  if(!window.__scanBusy){
    window.__scanBusy=true;
    try{
      const raw=await decodeScanFrame($('video'));
      if(raw){
        $('qrText').value=raw;
        parseQR(raw);
        stopScanner();
        toast('QR code scanned successfully.');
        return;
      }
    }finally{window.__scanBusy=false;}
  }
  setTimeout(()=>requestAnimationFrame(scanLoop),120);
}
function stopScanner(){if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null} $('video').srcObject=null;$('scanner').classList.add('hidden')}
$('scanBtn').onclick=startScanner;
$('stopScan').onclick=stopScanner;
$('parseBtn').onclick=()=>parseQR($('qrText').value);

/* ============================================================
   YES / NO CHECK POINTS
   ============================================================ */
document.querySelectorAll('.yn-group').forEach(group=>{
  const point=group.getAttribute('data-yn');
  group.querySelectorAll('.yn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      group.querySelectorAll('.yn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      checkAnswers[point]=btn.getAttribute('data-val');
      $('checkError').classList.add('hidden');
    });
  });
});

/* ============================================================
   PER-POINT PHOTOGRAPHS (points 3, 4, 5, 6, 7 only)
   ============================================================ */
document.querySelectorAll('.photo-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const point=btn.getAttribute('data-point');
    document.querySelector(`.photo-input[data-point="${point}"]`).click();
  });
});
document.querySelectorAll('.photo-input').forEach(inp=>{
  inp.addEventListener('change',e=>{
    const point=inp.getAttribute('data-point');
    [...e.target.files].forEach(file=>{
      const url=URL.createObjectURL(file);
      photosByPoint[point].push({blob:file,url});
    });
    e.target.value='';
    renderPhotos(point);
  });
});
function renderPhotos(point){
  const grid=$('photoGrid-'+point);
  grid.innerHTML='';
  photosByPoint[point].forEach((p,i)=>{
    const d=document.createElement('div');
    d.className='photo-item';
    d.innerHTML=`<img src="${p.url}" alt="Check Point ${point} Photo ${i+1}"><button class="remove-photo" aria-label="Remove">×</button>`;
    d.querySelector('button').onclick=()=>{
      URL.revokeObjectURL(p.url);
      photosByPoint[point].splice(i,1);
      renderPhotos(point);
    };
    grid.appendChild(d);
  });
}

/* ============================================================
   INSPECTION DATE/TIME — live clock, frozen at PDF generation
   ============================================================ */
function fmtDateTime(d){
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function tickClock(){ setv('inspectionDt', fmtDateTime(new Date())); }
setInterval(tickClock,30000);

/* ============================================================
   VALIDATION
   ============================================================ */
function validateCheckSheet(){
  const box=$('checkError');
  if(!val('customer')){
    box.classList.remove('hidden');
    box.textContent='Please select Customer Name before generating the PDF.';
    $('customer').scrollIntoView({behavior:'smooth',block:'center'});
    return false;
  }
  for(let i=1;i<=7;i++){
    if(!checkAnswers[i]){
      box.classList.remove('hidden');
      box.textContent='Please select Yes or No for all 7 check points before generating the PDF.';
      document.querySelector(`.check-point[data-point="${i}"]`).scrollIntoView({behavior:'smooth',block:'center'});
      return false;
    }
  }
  box.classList.add('hidden');
  return true;
}

/* ============================================================
   PDF GENERATION
   ============================================================ */
const CP_TEXT={
  1:{text:'Route Card completely filled upto Coating operation,(If Applicable) ID/ OD Slotting part received with PPE Cap.', ref:'Refer SOP-503-QA-07 SOP for Visual Inspection', remark:true},
  2:{text:'Verified Final ITP(All Parameter) fill up & Sign by Inspector & Supervisor', ref:null, remark:false},
  3:{text:'Verified Orientation, Special Note(If Any) & Special Operation(If Any)', ref:null, remark:true},
  4:{text:'Reverified Close dimn upto 0.005" and reading written in the ITP, Slitting Ring Type part should Verify 100%, OD, ID & Total Length', ref:null, remark:false},
  5:{text:'Verified ID hole upto 20mm by Borescope, ID >20mm use flash light/ Batteries.', ref:null, remark:false},
  6:{text:'Reverified ID/ OD Thread, Tapped Holes(If yes, Reading Written in ITP) & Relation Gauge (If Any).', ref:null, remark:true},
  7:{text:'Parts is Free From Dent, Damages, Burr, Dust, Dirt particle, Pitting Marks & Rusty Spots.', ref:'Refer WI-503-QA-11_R1 WI FOR Updated VISUAL INSPECTION', remark:false}
};
async function imageBytes(blob){return new Uint8Array(await blob.arrayBuffer())}
function wrap(text,font,size,maxWidth){
  const words=(text||'').split(/\s+/), out=[]; let line='';
  for(const w of words){
    const test=line?line+' '+w:w;
    if(font.widthOfTextAtSize(test,size) > maxWidth && line){out.push(line);line=w}
    else line=test;
  }
  if(line) out.push(line);
  return out;
}

async function createPDF(){
  if(!validateCheckSheet()) return;
  if(!window.PDFLib){toast('PDF library not loaded. Check internet connection and retry.');return}
  tickClock();
  $('pdfStatus').textContent='Creating A4 Visual Check Sheet…';
  try{
    const {PDFDocument,StandardFonts,rgb}=PDFLib;
    const pdf=await PDFDocument.create();
    const font=await pdf.embedFont(StandardFonts.Helvetica);
    const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic=await pdf.embedFont(StandardFonts.HelveticaOblique);
    const green=rgb(0,.608,.302), light=rgb(.94,.98,.95), black=rgb(.08,.1,.09), grey=rgb(.38,.43,.4);
    const yesBg=rgb(.85,.96,.88), noBg=rgb(1,.9,.9);

    let logoImg=null;
    try{const logoBytes=await fetch('assets/ultra-logo.png').then(r=>r.arrayBuffer());logoImg=await pdf.embedPng(logoBytes)}catch{}
    function drawLogo(pg,x,y,maxW,maxH){if(!logoImg)return;const scale=Math.min(maxW/logoImg.width,maxH/logoImg.height);pg.drawImage(logoImg,{x,y,width:logoImg.width*scale,height:logoImg.height*scale})}

    const PW=595.28, PH=841.89, margin=32, w=PW-margin*2;
    let page=pdf.addPage([PW,PH]);
    let y=PH-38;

    function drawHeader(pg){
      drawLogo(pg,margin,PH-78,118,42);
      pg.drawText('ULTRA@503',{x:margin+128,y:PH-40,size:15,font:bold,color:green});
      pg.drawText('VISUAL CHECK SHEET',{x:margin+128,y:PH-55,size:10.5,font:bold,color:black});
      const fmt1='Format No : UC/QA/FR/61', fmt2='Rev / Date : 00/06.08.2025';
      pg.drawText(fmt1,{x:PW-margin-140,y:PH-36,size:8.5,font:bold,color:grey});
      pg.drawText(fmt2,{x:PW-margin-140,y:PH-47,size:8.5,font:bold,color:grey});
      pg.drawLine({start:{x:margin,y:PH-86},end:{x:PW-margin,y:PH-86},thickness:1.2,color:green});
      return PH-100;
    }
    // Footer sits in its own reserved band; content and photos must stay above FOOTER_TOP.
    const FOOTER_TOP=40;
    function drawFooter(pg){
      pg.drawLine({start:{x:margin,y:FOOTER_TOP-8},end:{x:PW-margin,y:FOOTER_TOP-8},thickness:.8,color:green});
      pg.drawText('ULTRA@503 — Visual Check Sheet  |  Ultra Corpotech Pvt. Ltd.',{x:margin,y:FOOTER_TOP-22,size:7.5,font:bold,color:green});
    }
    function newPage(){
      drawFooter(page);
      page=pdf.addPage([PW,PH]);
      y=drawHeader(page);
    }
    function ensure(need){
      if(y-need < FOOTER_TOP+6){ newPage(); }
    }

    y=drawHeader(page);

    // ---- Route Card details (compact table) ----
    ensure(20+8*15.5);
    page.drawRectangle({x:margin,y:y-9,width:w,height:19,color:green});
    page.drawText('ROUTE CARD DETAILS',{x:margin+8,y:y-2,size:9.5,font:bold,color:rgb(1,1,1)});
    y-=27;
    const qtyOrDash=v=>v?v:'—';
    const rows=[
      ['Part Number', qtyOrDash(val('partNo'))],
      ['Customer PO No.', qtyOrDash(val('poNo'))],
      ['PO Line No.', qtyOrDash(val('poLine'))],
      ['UC Batch No. & Job Serial No.', qtyOrDash(val('ucBatch'))],
      ['Heat No.', qtyOrDash(val('heatNo'))],
      ['PO Qty', qtyOrDash(val('poQty'))],
      ['Total Qty', qtyOrDash(val('totalQty'))],
      ['Customer Name', qtyOrDash(val('customer'))],
    ];
    const rowH=15.5;
    rows.forEach((r,i)=>{
      page.drawRectangle({x:margin,y:y-rowH+4,width:w,height:rowH,color:i%2?light:rgb(1,1,1),borderColor:rgb(.85,.89,.86),borderWidth:.5});
      page.drawText(r[0],{x:margin+7,y:y-7.5,size:7.6,font:bold,color:grey});
      page.drawText(String(r[1]),{x:margin+190,y:y-7.5,size:8,font,color:black,maxWidth:w-198});
      y-=rowH;
    });
    y-=12;

    // ---- 7 Check Points (compact, single-line result pill, remark inline & fully visible) ----
    ensure(19);
    page.drawRectangle({x:margin,y:y-9,width:w,height:19,color:green});
    page.drawText('VISUAL CHECK SHEET — 7 POINTS',{x:margin+8,y:y-2,size:9.5,font:bold,color:rgb(1,1,1)});
    y-=25;

    const textSize=8.4, refSize=7.2, remarkSize=7.8, lineGap=10.2;
    for(let i=1;i<=7;i++){
      const cp=CP_TEXT[i];
      const textLines=wrap(`${i}. ${cp.text}`,bold,textSize,w-14);
      const refLines=cp.ref?wrap(cp.ref,italic,refSize,w-14):[];
      const remarkTxt=cp.remark?val('remark'+i):'';
      const remarkLines=remarkTxt?wrap('Remark: '+remarkTxt,font,remarkSize,w-14):[];

      const blockHeight = 5 + textLines.length*lineGap + refLines.length*9.4 + 13 /*result line*/ + (remarkLines.length*9.4) + 6;
      ensure(blockHeight);

      page.drawRectangle({x:margin,y:y-blockHeight+6,width:w,height:blockHeight,color:rgb(.99,.995,.99),borderColor:rgb(.85,.89,.86),borderWidth:.6});
      let ty=y-3;
      textLines.forEach(line=>{page.drawText(line,{x:margin+7,y:ty,size:textSize,font:bold,color:black});ty-=lineGap});
      refLines.forEach(line=>{page.drawText(line,{x:margin+7,y:ty,size:refSize,font:italic,color:green});ty-=9.4});

      const ans=checkAnswers[i];
      const pillColor = ans==='YES'?yesBg:(ans==='NO'?noBg:rgb(1,1,1));
      const pillBorder = ans==='YES'?green:(ans==='NO'?rgb(.75,.1,.1):rgb(.8,.85,.82));
      const pillTextColor = ans==='YES'?green:(ans==='NO'?rgb(.75,.1,.1):grey);
      const pillW=42, pillH=12.5;
      page.drawRectangle({x:margin+7,y:ty-pillH+2,width:pillW,height:pillH,color:pillColor,borderColor:pillBorder,borderWidth:1});
      page.drawText(ans||'—',{x:margin+7+ (ans?(ans==='YES'?11:13):16),y:ty-9.5,size:8,font:bold,color:pillTextColor});
      page.drawText('Result of Check Point '+i,{x:margin+7+pillW+10,y:ty-9.5,size:7.4,font,color:grey});
      ty-=13;

      remarkLines.forEach(line=>{page.drawText(line,{x:margin+7,y:ty,size:remarkSize,font,color:black});ty-=9.4});

      y=y-blockHeight-4;
    }

    // ---- Inspector Information ----
    ensure(46);
    page.drawRectangle({x:margin,y:y-9,width:w,height:19,color:green});
    page.drawText('INSPECTOR INFORMATION',{x:margin+8,y:y-2,size:9.5,font:bold,color:rgb(1,1,1)});
    y-=27;
    page.drawText('Inspector Name:',{x:margin+7,y,size:8,font:bold,color:grey});
    page.drawText(val('inspectorName')||'—',{x:margin+110,y,size:8.5,font,color:black});
    page.drawText('Employee ID No.:',{x:margin+290,y,size:8,font:bold,color:grey});
    page.drawText(val('inspectorId')||'—',{x:margin+400,y,size:8.5,font,color:black});
    y-=16;
    page.drawText('Inspection Date / Time:',{x:margin+7,y,size:8,font:bold,color:grey});
    page.drawText(val('inspectionDt')||'—',{x:margin+140,y,size:8.5,font,color:black});
    y-=16;

    drawFooter(page);

    // ---- Photo pages (points 3,4,5,6,7 in order, 2x2, max 4/page) ----
    // Images are laid out inside a grid strictly between the header line and the
    // footer band, with padding, so no photograph ever sits under the header or footer.
    const flatPhotos=[];
    [3,4,5,6,7].forEach(pt=>photosByPoint[pt].forEach((p,idx)=>flatPhotos.push({point:pt,idx:idx+1,blob:p.blob})));

    for(let i=0;i<flatPhotos.length;i+=4){
      const pg=pdf.addPage([PW,PH]);
      const headerBottom=drawHeader(pg);
      pg.drawText('NON-CONFORMANCE / INSPECTION PHOTOGRAPHS',{x:margin,y:headerBottom+4,size:9.5,font:bold,color:green});

      const gridTop=headerBottom-14;
      const gridBottom=FOOTER_TOP+10;
      const gridGap=14;
      const gridH=gridTop-gridBottom;
      const cellW=(w-gridGap)/2;
      const cellH=(gridH-gridGap)/2;
      const cellPad=10, labelH=14;

      const batch=flatPhotos.slice(i,i+4);
      for(let j=0;j<batch.length;j++){
        const item=batch[j];
        const col=j%2, row=Math.floor(j/2);
        const cellX=margin+col*(cellW+gridGap);
        const cellTop=gridTop-row*(cellH+gridGap);
        const cellY=cellTop-cellH;

        pg.drawRectangle({x:cellX,y:cellY,width:cellW,height:cellH,borderColor:rgb(.78,.83,.8),borderWidth:1,color:rgb(.98,.99,.98)});

        const bytes=await imageBytes(item.blob);
        let img;
        try{img=await pdf.embedJpg(bytes)}catch{img=await pdf.embedPng(bytes)}
        const availW=cellW-cellPad*2, availH=cellH-cellPad*2-labelH;
        const sc=Math.min(availW/img.width,availH/img.height);
        const dw=img.width*sc, dh=img.height*sc;
        const dx=cellX+(cellW-dw)/2;
        const dy=cellY+cellPad+labelH+(availH-dh)/2;
        pg.drawImage(img,{x:dx,y:dy,width:dw,height:dh});
        pg.drawText(`Check Point ${item.point} — Photo ${item.idx}`,{x:cellX+cellPad,y:cellY+cellPad-2,size:8,font:bold,color:grey});
      }
      drawFooter(pg);
    }

    const bytes=await pdf.save();
    lastPdfBlob=new Blob([bytes],{type:'application/pdf'});
    const batchTag=(val('ucBatch')||'VCS').split(/\s+/)[0].replace(/[^A-Za-z0-9-]/g,'');
    const dstamp=(()=>{const d=new Date();const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`})();
    lastPdfName=`VCS-${batchTag}-${dstamp}.pdf`;
    $('downloadPdf').disabled=false;$('sharePdf').disabled=false;
    $('pdfStatus').textContent=`Check sheet ready: ${lastPdfName} (${(lastPdfBlob.size/1024).toFixed(0)} KB)`;
    toast('Visual Check Sheet PDF created successfully.');
  }catch(e){
    console.error(e);
    $('pdfStatus').textContent='PDF creation failed: '+e.message;
    toast('PDF creation failed. See browser console for details.');
  }
}

function downloadPDF(){
  if(!lastPdfBlob)return;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(lastPdfBlob); a.download=lastPdfName; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('PDF download started.');
}
async function sharePDF(){
  if(!lastPdfBlob)return;
  const file=new File([lastPdfBlob],lastPdfName,{type:'application/pdf'});
  const shareText=[
    'ULTRA@503 Visual Check Sheet',
    '',
    `Part No.: ${val('partNo')||'—'}`,
    `PO No.: ${val('poNo')||'—'}`,
    `UC Batch No.: ${val('ucBatch')||'—'}`,
    'Format No.: UC/QA/FR/61',
    'Rev / Date: 00/06.08.2025'
  ].join('\n');
  try{
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
      await navigator.share({title:lastPdfName,text:shareText,files:[file]});
      toast('Check sheet PDF shared.');
    }else{
      downloadPDF();
      toast('File sharing is not supported by this browser; PDF downloaded instead.');
    }
  }catch(e){
    if(e.name!=='AbortError')toast('Share cancelled or unavailable. Try Download PDF.');
  }
}

/* ============================================================
   CREATE NEW ENTRY — keeps Employee Profile, clears everything else
   ============================================================ */
function createNewEntry(){
  if(!confirm('Create a new entry? Current inspection data, selections, remarks and photographs will be cleared.')) return;
  stopScanner();
  ['partNo','poNo','poLine','ucBatch','heatNo','poQty','totalQty','qrText'].forEach(id=>setv(id,''));
  setv('customer','');
  $('qrParseMsg').classList.add('hidden');
  $('mobileNotice').classList.add('hidden');

  for(let i=1;i<=7;i++){
    checkAnswers[i]=null;
    document.querySelector(`.yn-group[data-yn="${i}"]`).querySelectorAll('.yn').forEach(b=>b.classList.remove('active'));
  }
  [1,3,6].forEach(i=>setv('remark'+i,''));
  [3,4,5,6,7].forEach(pt=>{
    photosByPoint[pt].forEach(p=>URL.revokeObjectURL(p.url));
    photosByPoint[pt]=[];
    renderPhotos(pt);
  });
  $('checkError').classList.add('hidden');

  lastPdfBlob=null; lastPdfName='';
  $('downloadPdf').disabled=true; $('sharePdf').disabled=true;
  $('pdfStatus').textContent='No check sheet generated yet.';

  tickClock();
  toast('New entry ready. Employee profile kept.');
}

$('createPdf').onclick=createPDF;
$('newEntry').onclick=createNewEntry;
$('downloadPdf').onclick=downloadPDF;
$('sharePdf').onclick=sharePDF;

window.addEventListener('online',()=>{$('onlineStatus').textContent='ONLINE'});
window.addEventListener('offline',()=>{$('onlineStatus').textContent='OFFLINE'});

renderProfile();
tickClock();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
