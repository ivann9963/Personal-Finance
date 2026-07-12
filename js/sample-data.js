// === SAMPLE DATA ===
function loadSampleData() {
  const now = new Date();
  const dc = S.settings.defaultCurrency || 'EUR';
  // Accounts
  const acc1Id='sample-acc1', acc2Id='sample-acc2', acc3Id='sample-acc3';
  if (!S.accounts.find(a=>a.id===acc1Id)) {
    S.accounts.push({id:acc1Id,name:'Main Checking',type:'checking',balance:285000,currency:'EUR',institution:'Revolut',convertedBalance:285000});
    S.accounts.push({id:acc2Id,name:'Savings',type:'savings',balance:420000,currency:'EUR',institution:'N26',convertedBalance:420000});
    S.accounts.push({id:acc3Id,name:'Credit Card',type:'credit',balance:-28500,currency:'EUR',institution:'Visa',convertedBalance:-28500});
    // Investment with a value history: shows cost basis vs current value (+6.5% gain) and the detail chart.
    const invHist = [-150,-120,-90,-60,-30,0].map((d,i)=>{
      const dt = new Date(now); dt.setDate(dt.getDate()+d);
      return {date: dt.toISOString().slice(0,10), value: [500000,504500,498200,512000,521500,532500][i]};
    });
    S.accounts.push({id:'sample-acc4',name:'Index Funds',type:'investment',balance:532500,currency:'EUR',institution:'Trade Republic',convertedBalance:532500,costBasis:500000,valueHistory:invHist});
  }
  // Recurring schedules
  const rent_id='sample-rent', spotify_id='sample-spotify', netflix_id='sample-netflix';
  const startOfQ = new Date(now.getFullYear(), now.getMonth()-2, 1).toISOString().slice(0,10);
  if (!S.recurringSchedules.find(r=>r.id===rent_id)) {
    S.recurringSchedules.push({id:rent_id,type:'expense',amount:90000,currency:'EUR',convertedAmount:90000,exchangeRate:1,category:'housing',merchant:'Landlord',accountId:acc1Id,frequency:'monthly',startDate:startOfQ,active:true,note:'Monthly rent'});
    S.recurringSchedules.push({id:spotify_id,type:'expense',amount:999,currency:'EUR',convertedAmount:999,exchangeRate:1,category:'subscriptions',merchant:'Spotify',accountId:acc3Id,frequency:'monthly',startDate:startOfQ,active:true});
    S.recurringSchedules.push({id:netflix_id,type:'expense',amount:1599,currency:'EUR',convertedAmount:1599,exchangeRate:1,category:'subscriptions',merchant:'Netflix',accountId:acc3Id,frequency:'monthly',startDate:startOfQ,active:true});
  }
  // Generate recurring
  generateRecurring();
  // Add salary
  for (let i=2;i>=0;i--) {
    const d=new Date(now.getFullYear(),now.getMonth()-i,25);
    if (d<=now) addSampleTx('income',320000,'EUR','income','Employer',acc1Id,d,'Salary');
  }
  // Groceries ~2-3x/week
  const stores=['Lidl','Aldi','Kaufland','Penny','Rewe'];
  const coffees=['Starbucks','Costa Coffee','Local Café','Coffee House'];
  const restaurants=['Sushi Place','Pizza Roma','Thai Garden','Burger Bar','Greek Taverna'];
  for (let daysBack=85;daysBack>=1;daysBack--) {
    const d=new Date(now); d.setDate(d.getDate()-daysBack);
    if (d>now) continue;
    const dow=d.getDay();
    // Groceries Mon,Wed,Sat — supermarkets belong in Groceries, not Food & Dining
    if ([1,3,6].includes(dow)) addSampleTx('expense',2500+rnd(6000),'EUR','groceries',stores[rnd(stores.length)],acc1Id,d);
    // Coffee almost daily
    if (Math.random()<0.65) addSampleTx('expense',300+rnd(300),'EUR','food',coffees[rnd(coffees.length)],acc1Id,d);
    // Restaurant Fri/Sat evening
    if ([5,6].includes(dow)&&Math.random()<0.5) addSampleTx('expense',1800+rnd(4700),'EUR','food',restaurants[rnd(restaurants.length)],acc1Id,d);
    // Fuel ~2x/month
    if (dow===2&&daysBack%14<2) addSampleTx('expense',4800+rnd(1400),'EUR','transport','Shell',acc1Id,d);
    // Public transport random
    if (Math.random()<0.15) addSampleTx('expense',200+rnd(300),'EUR','transport','Public Transport',acc1Id,d);
  }
  // Shopping
  ['Zara','H&M','Amazon','IKEA','MediaMarkt','Decathlon'].forEach((m,i)=>{
    const d=new Date(now); d.setDate(d.getDate()-i*13-5);
    addSampleTx('expense',3500+rnd(8500),'EUR','shopping',m,acc3Id,d);
  });
  // One flight
  const flightDate=new Date(now); flightDate.setDate(flightDate.getDate()-45);
  addSampleTx('expense',18000,'EUR','travel','Ryanair',acc3Id,flightDate,'Weekend trip');
  // Pharmacy / medical
  [[1200,'EUR','Pharmacy'],[850,'EUR','Pharmacy'],[3400,'EUR','Doctor Visit']].forEach(([amt,cur,m],i)=>{
    const d=new Date(now); d.setDate(d.getDate()-i*25-10);
    addSampleTx('expense',amt,cur,'medical',m,acc1Id,d);
  });
  // Utilities
  addSampleTx('expense',8500,'EUR','utilities','Electric Company',acc1Id,new Date(now.getFullYear(),now.getMonth()-1,15));
  addSampleTx('expense',3200,'EUR','utilities','Internet Provider',acc1Id,new Date(now.getFullYear(),now.getMonth()-1,20));
  // USD online purchases
  S.exchangeRates['USD_EUR']=0.92;
  addSampleTx('expense',Math.round(2999*0.92),'EUR','shopping','Amazon US',acc3Id,new Date(now.getFullYear(),now.getMonth()-1,8));
  // Budgets
  if (!S.budgets.length) {
    S.budgets.push({id:gid(),category:'groceries',amount:40000,currency:'EUR'});
    S.budgets.push({id:gid(),category:'food',amount:25000,currency:'EUR'});
    S.budgets.push({id:gid(),category:'transport',amount:15000,currency:'EUR'});
    S.budgets.push({id:gid(),category:'shopping',amount:20000,currency:'EUR'});
  }
  S.transactions.sort((a,b)=>b.date.localeCompare(a.date));
  saveState(); renderCurrentTab();
  showToast('Sample data loaded','success');
}
function addSampleTx(type,amount,currency,category,merchant,accountId,date,note='') {
  const ds=date instanceof Date?date.toISOString().slice(0,10):date;
  const dup=S.transactions.some(t=>t.date===ds&&t.merchant===merchant&&t.originalAmount===amount&&t.type===type);
  if (dup) return;
  const dc2=defaultConvert(amount,currency);
  S.transactions.push({id:gid(),type,originalAmount:amount,originalCurrency:currency,
    convertedAmount:dc2.ok?dc2.amount:amount,exchangeRate:dc2.rate||1,
    category,merchant,accountId,date:ds,note,isRecurring:false});
}
function rnd(n) { return Math.floor(Math.random()*n); }

