/*
  Sponsors section (owner: Brianna).
  Passcode-locked sponsor CRM: lists and edits rows on the "Sponsor Pipeline" tab
  through the Apps Script API (actions sponsors_list / sponsors_save). Contact
  details are never part of the public GET payload. No money is calculated here.
  Loaded by index.html after config.js and app.js.
*/
/* START: Sponsor Pipeline — authenticated requests only */
(function () {
  var rows = [], passcode = '', editing = null, pending = false;
  var byId = function(id) { return document.getElementById(id); };
  if (!byId('sponsor-unlock')) return;
  var form = byId('sponsor-editor'), keys = ['business','contact','communication','stage','followup','notes'];
  function message(text) { byId('sponsor-message').textContent = text; }
  async function request(action, extra) {
    if (typeof API_URL !== 'string' || !API_URL) throw new Error('Dashboard API is not configured.');
    var response = await fetch(API_URL, {method:'POST', body:JSON.stringify(Object.assign({action:action,passcode:passcode},extra || {}))});
    if (!response.ok) throw new Error('Connection failed. Please retry.');
    var result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }
  function draw() {
    var body = byId('sponsor-crm-body'); body.replaceChildren();
    var q = byId('sponsor-search').value.trim().toLowerCase();
    var status = byId('sponsor-status').value, due = byId('sponsor-followups').getAttribute('aria-pressed') === 'true';
    var today = new Date(), iso = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    var shown = rows.filter(function(row) {
      return (!q || keys.map(function(k){return row[k] || '';}).join(' ').toLowerCase().includes(q)) &&
        (!status || row.stage === status) && (!due || (row.followup && row.followup <= iso && !/^(declined|closed|received)$/i.test(row.stage)));
    });
    shown.forEach(function(row) {
      var tr = document.createElement('tr');
      keys.forEach(function(k){ var td=document.createElement('td'); td.textContent=row[k] || '—'; tr.appendChild(td); });
      var td=document.createElement('td'), button=document.createElement('button');
      button.type='button'; button.className='btn'; button.textContent='Edit';
      button.addEventListener('click',function(){openEditor(row);}); td.appendChild(button); tr.appendChild(td); body.appendChild(tr);
    });
    if (!shown.length) {var tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='No sponsors match these filters.';tr.appendChild(td);body.appendChild(tr);}
  }
  function load(result) {
    rows=result.sponsors;
    var statuses = Array.from(new Set(rows.map(function(r){return r.stage;}).filter(Boolean))).sort();
    var select=byId('sponsor-status'); select.replaceChildren(new Option('All statuses',''));
    byId('sponsor-stages').replaceChildren();
    statuses.forEach(function(s){select.appendChild(new Option(s,s));byId('sponsor-stages').appendChild(new Option(s,s));});
    draw();
  }
  function openEditor(row) {
    editing=row || null;
    keys.forEach(function(k){form.elements[k].value=row ? row[k] || '' : '';});
    byId('sponsor-editor-title').textContent=row ? 'Edit sponsor' : 'Add sponsor';
    form.hidden=false;form.elements.business.focus();
  }
  byId('sponsor-unlock').addEventListener('submit',async function(e){
    e.preventDefault(); if(pending)return; pending=true;
    passcode=byId('sponsor-passcode').value; message('Loading tracker…');
    try {load(await request('sponsors_list'));byId('sponsor-private').hidden=false;byId('sponsor-unlock').hidden=true;byId('sponsor-lock').hidden=false;byId('sponsor-passcode').value='';message('Tracker unlocked.');}
    catch(err){passcode='';message(err.message);}finally{pending=false;}
  });
  byId('sponsor-lock').addEventListener('click',function(){
    if(pending)return;passcode='';rows=[];editing=null;form.reset();form.hidden=true;
    byId('sponsor-crm-body').replaceChildren();byId('sponsor-private').hidden=true;byId('sponsor-unlock').hidden=false;byId('sponsor-lock').hidden=true;message('Tracker locked.');
  });
  form.addEventListener('submit',async function(e){
    e.preventDefault();if(pending)return;pending=true;
    var record={};keys.forEach(function(k){record[k]=form.elements[k].value;});
    var buttons=form.querySelectorAll('button');buttons.forEach(function(b){b.disabled=true;});
    try {load(await request('sponsors_save',{record:record,row:editing ? editing.row : null,version:editing ? editing.version : null}));form.hidden=true;editing=null;message('Sponsor saved to Google Sheets.');}
    catch(err){message(err.message);}finally{pending=false;buttons.forEach(function(b){b.disabled=false;});}
  });
  byId('sponsor-add').addEventListener('click',function(){openEditor(null);});
  byId('sponsor-cancel').addEventListener('click',function(){form.hidden=true;});
  byId('sponsor-search').addEventListener('input',draw);
  byId('sponsor-status').addEventListener('change',draw);
  byId('sponsor-followups').addEventListener('click',function(){this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')==='true'?'false':'true');draw();});
})();
/* END: Sponsor Pipeline */
