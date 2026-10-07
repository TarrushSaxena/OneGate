async page => {
  await page.goto('http://localhost:3000/index.html?review=design-audit-repairs#hero');
  page.setDefaultTimeout(5000);
  const results=[];
  const measure=async(name)=>{
    await page.waitForTimeout(1000);
    const stats=await page.evaluate(()=>({
      viewport:innerWidth,rootWidth:document.querySelector('#app').getBoundingClientRect().width,
      headings:[...document.querySelectorAll('h1,h2')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>e.innerText).slice(0,6),
      overflow:[...document.querySelectorAll('main,section,header,form,input,textarea,button,iframe')].filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width&&r.height&&c.position!=='fixed'&&!e.closest('.og-nav')&&(r.right>innerWidth+3||r.left < -3);}).map(e=>({tag:e.tagName,id:e.id,class:e.className})).slice(0,8),
      scroll:[...document.querySelectorAll('.og-main,#og-overview,.page-container')].map(e=>({s:e.id||e.className,height:e.clientHeight,content:e.scrollHeight,overflow:getComputedStyle(e).overflowY})),
      brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src).slice(0,6),
      smallText:[...document.querySelectorAll('.og-service p,.og-action-history-card summary strong,.og-calendar-day,.og-message')].filter(e=>e.getBoundingClientRect().width).slice(0,8).map(e=>({s:e.className||e.tagName,size:getComputedStyle(e).fontSize})),
    }));
    await page.screenshot({path:'output/playwright/'+name+'.png'});
    results.push({name,...stats});
  };
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>navigate('hero'));
    await measure('hero-'+width);
    await page.evaluate(()=>navigate('how-it-works'));
    await measure('how-it-works-'+width);
    await page.evaluate(()=>navigate('login'));
    await measure('login-'+width);
    await page.getByRole('button',{name:'Sign up',exact:true}).click();
    await measure('signup-'+width);
  }
  await page.evaluate(()=>navigate('login'));
  await page.getByRole('button',{name:'Employee',exact:false}).click();
  await page.locator('.og-work').waitFor();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    for(const view of ['chat','tickets','today','calendar','services','actions','policies']){
      await page.locator('.og-sidebar-toggle').click();
      await page.locator('[data-view='+view+']').click();
      await page.waitForTimeout(650);
      await measure('employee-'+view+'-'+width);
      if(view==='tickets'&&width===390)await page.getByRole('button',{name:'Close requests'}).click();
    }
  }
  for(const role of ['IT Specialist','IT Manager','Director']){
    await page.evaluate(()=>navigate('login'));
    await page.getByRole('button',{name:role,exact:false}).click();
    await page.locator('.og-work').waitFor();
    await page.waitForTimeout(3000);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});
      await measure(role.replaceAll(' ','-')+'-'+width);
    }
  }
  return results;
}
