// === CONFIG & CONSTANTS ===
const STORAGE_KEY = 'financeapp_v1';
const CURRENCIES = [
  {code:'EUR',symbol:'€',name:'Euro'},{code:'USD',symbol:'$',name:'US Dollar'},
  {code:'GBP',symbol:'£',name:'British Pound'},{code:'BGN',symbol:'лв',name:'Bulgarian Lev'},
  {code:'CHF',symbol:'Fr',name:'Swiss Franc'},{code:'JPY',symbol:'¥',name:'Japanese Yen'},
  {code:'CAD',symbol:'C$',name:'Canadian Dollar'},{code:'AUD',symbol:'A$',name:'Australian Dollar'},
  {code:'SEK',symbol:'kr',name:'Swedish Krona'},{code:'NOK',symbol:'kr',name:'Norwegian Krone'},
  {code:'DKK',symbol:'kr',name:'Danish Krone'},{code:'PLN',symbol:'zł',name:'Polish Zloty'},
  {code:'CZK',symbol:'Kč',name:'Czech Koruna'},{code:'HUF',symbol:'Ft',name:'Hungarian Forint'},
  {code:'RON',symbol:'lei',name:'Romanian Leu'},{code:'TRY',symbol:'₺',name:'Turkish Lira'},
  {code:'INR',symbol:'₹',name:'Indian Rupee'},{code:'CNY',symbol:'¥',name:'Chinese Yuan'},
  {code:'BRL',symbol:'R$',name:'Brazilian Real'},{code:'MXN',symbol:'MX$',name:'Mexican Peso'},
  {code:'SGD',symbol:'S$',name:'Singapore Dollar'},{code:'HKD',symbol:'HK$',name:'Hong Kong Dollar'},
  {code:'AED',symbol:'د.إ',name:'UAE Dirham'},{code:'SAR',symbol:'﷼',name:'Saudi Riyal'},
  {code:'ZAR',symbol:'R',name:'South African Rand'},{code:'ILS',symbol:'₪',name:'Israeli Shekel'},
  {code:'THB',symbol:'฿',name:'Thai Baht'},{code:'KRW',symbol:'₩',name:'South Korean Won'},
  {code:'NZD',symbol:'NZ$',name:'New Zealand Dollar'},{code:'UAH',symbol:'₴',name:'Ukrainian Hryvnia'},
  {code:'RUB',symbol:'₽',name:'Russian Ruble'}
];
const CATEGORIES = [
  {id:'food',name:'Food & Dining',emoji:'🍔',color:'#FF6B6B'},
  {id:'groceries',name:'Groceries',emoji:'🛒',color:'#20BF6B'},
  {id:'transport',name:'Transport',emoji:'🚗',color:'#4ECDC4'},
  {id:'housing',name:'Housing',emoji:'🏠',color:'#45B7D1'},
  {id:'health',name:'Health',emoji:'💊',color:'#96CEB4'},
  {id:'entertainment',name:'Entertainment',emoji:'🎬',color:'#C39BD3'},
  {id:'shopping',name:'Shopping',emoji:'🛍️',color:'#F7DC6F'},
  {id:'income',name:'Work/Income',emoji:'💼',color:'#58A6FF'},
  {id:'savings',name:'Savings',emoji:'💰',color:'#3FB950'},
  {id:'travel',name:'Travel',emoji:'✈️',color:'#FF9F43'},
  {id:'subscriptions',name:'Subscriptions',emoji:'📱',color:'#A29BFE'},
  {id:'education',name:'Education',emoji:'🎓',color:'#FD79A8'},
  {id:'pets',name:'Pets',emoji:'🐾',color:'#FDCB6E'},
  {id:'fitness',name:'Fitness',emoji:'🏋️',color:'#6C5CE7'},
  {id:'gifts',name:'Gifts',emoji:'🎁',color:'#E17055'},
  {id:'medical',name:'Medical',emoji:'🏥',color:'#00CEC9'},
  {id:'bars',name:'Bars & Nightlife',emoji:'🍺',color:'#FFEAA7'},
  {id:'utilities',name:'Utilities',emoji:'⚡',color:'#74B9FF'},
  {id:'other',name:'Other',emoji:'❓',color:'#B2BEC3'}
];
const ACCOUNT_TYPES = [
  {id:'checking',name:'Checking',emoji:'🏦'},
  {id:'savings',name:'Savings',emoji:'🐷'},
  {id:'credit',name:'Credit Card',emoji:'💳'},
  {id:'investment',name:'Investment',emoji:'📈'},
  {id:'cash',name:'Cash',emoji:'💵'},
  {id:'other',name:'Other',emoji:'📁'}
];
// Quick-pick icons for accounts (users can still type any emoji). Money/bank-leaning set.
const ACCOUNT_EMOJIS = ['🏦','🐷','💳','📈','💵','💰','🪙','🏧','💎','🛡️','🎯','🚀','🏠','🚗','✈️','🎓','👛','💼','📊','🧾','🌟','❤️','🔒','🪺'];
// Reused for the account color swatches (same palette the category editor uses).
const ACCOUNT_COLORS = ['#58A6FF','#3FB950','#F0B429','#FF6B6B','#4ECDC4','#A29BFE','#C39BD3','#FF9F43','#00CEC9','#FD79A8','#74B9FF','#B2BEC3'];

// App state
let S = null; // main state object
let _charts = {}; // Chart.js instances by canvas id
let _currentTab = 'dashboard';
let _planView = 'budgets';
let _analyticsRange = '3M';
let _txFilter = 'all';
let _txSearch = '';
let _txPage = 1;
let _txDateFilter = null; // {start,end,label} when a drill-down (e.g. from Analytics) scopes the list to a date range
let _budgetMonth = new Date(); _budgetMonth.setDate(1);
let _calMonth = new Date(); _calMonth.setDate(1);
let _activeSwipeRow = null;
let _longPressTimer = null;
let _tabsInit = {};

