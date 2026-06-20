// === CHART WRAPPERS ===
function chartColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    border:  light ? 'rgba(0,0,0,.08)'       : 'rgba(255,255,255,.07)',
    text2:   light ? '#57534E'               : '#8B949E',
    text3:   light ? '#A8A29E'               : '#6E7681',
    gridLine:light ? 'rgba(0,0,0,.06)'       : 'rgba(255,255,255,.05)',
  };
}
function destroyChart(id) {
  if (_charts[id]) { try{_charts[id].destroy();}catch(e){} delete _charts[id]; }
}
function mkSparkline(canvasId, dataPoints) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const dc = S.settings.defaultCurrency;
  const isDark = document.documentElement.dataset.theme !== 'light';
  _charts[canvasId] = new Chart(canvas, {
    type:'line',
    data:{labels:dataPoints.map((_,i)=>i), // category axis needs labels or the line won't render
      datasets:[{data:dataPoints, borderColor:'#F0B429', borderWidth:2,
      fill:true, backgroundColor:'rgba(240,180,41,.08)',
      pointRadius:0, tension:.4}]},
    options:{responsive:true, maintainAspectRatio:false,
      animation:{duration:600},
      plugins:{legend:{display:false}, tooltip:{
        callbacks:{label:ctx=>' '+formatCurrency(ctx.raw*100,dc)}}},
      scales:{x:{display:false},y:{display:false}}}
  });
}
function mkDonut(canvasId, labels, data, colors) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  _charts[canvasId] = new Chart(canvas, {
    type:'doughnut',
    data:{labels, datasets:[{data, backgroundColor:colors, borderWidth:2,
      borderColor:'var(--bg-card)', hoverOffset:6}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:'72%',
      animation:{animateRotate:true, duration:600},
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${formatCurrency(ctx.raw,S.settings.defaultCurrency)}`}}}}
  });
  return _charts[canvasId];
}
function mkLine(canvasId, labels, datasets) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const dc = S.settings.defaultCurrency;
  const cc = chartColors();
  _charts[canvasId] = new Chart(canvas, {
    type:'line',
    data:{labels, datasets},
    options:{responsive:true, maintainAspectRatio:false,
      animation:{duration:500},
      interaction:{mode:'index', intersect:false},
      plugins:{legend:{display:datasets.length>1, position:'top',
        labels:{color:cc.text2, usePointStyle:true, pointStyleWidth:8}},
        tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label||''}: ${formatCurrency(ctx.raw,dc)}`}}},
      scales:{
        x:{grid:{color:cc.gridLine},ticks:{color:cc.text3,maxTicksLimit:6}},
        y:{grid:{color:cc.gridLine},ticks:{color:cc.text3,
            callback:v=>formatCurrency(v,dc,true)}}}}
  });
}
function mkBar(canvasId, labels, datasets) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const dc = S.settings.defaultCurrency;
  const cc = chartColors();
  _charts[canvasId] = new Chart(canvas, {
    type:'bar',
    data:{labels, datasets},
    options:{responsive:true, maintainAspectRatio:false,
      animation:{duration:500},
      interaction:{mode:'index', intersect:false},
      plugins:{legend:{display:true, position:'top',
        labels:{color:cc.text2, usePointStyle:true}},
        tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${formatCurrency(ctx.raw,dc)}`}}},
      scales:{
        x:{grid:{display:false},ticks:{color:cc.text3}},
        y:{grid:{color:cc.gridLine},ticks:{color:cc.text3,
            callback:v=>formatCurrency(v,dc,true)}}}}
  });
}

