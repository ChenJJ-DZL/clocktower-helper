test("v7",async({page})=>{
  console.log("=== v7 start ===");
  await page.goto("/",{waitUntil:"networkidle"});await page.waitForTimeout(1200);
  await page.locator("text=暗流涌动").first().click();await page.waitForTimeout(500);
  await page.locator('button:has-text("快速测试")').click();await page.waitForTimeout(1800);
  const drunkBtn=page.locator('button:has-text("设置酒鬼身份")');
  if(await drunkBtn.isVisible({timeout:1500}).catch(()=>false)){await drunkBtn.click();await page.waitForTimeout(500);const opt=page.locator('div[role="dialog"] button').first();if(await opt.isVisible({timeout:800}).catch(()=>false)){await opt.click();await page.waitForTimeout(300);}await CD(page);await page.waitForTimeout(200);}
  const enterN=page.locator('button:has-text("确认无误，入夜")');
  if(await enterN.isVisible({timeout:2500}).catch(()=>false)){await enterN.click();console.log("[入夜]");await page.waitForTimeout(800);}
  await CD(page);await page.waitForTimeout(400);
  let R=0,N=0,D=0,E=0,S=0,iN=false;
  for(R=0;R<500;R++){
    const p=await phase(page);
    if(p==="gameOver"){console.log("\nGAME OVER! R="+R+" N="+N+" D="+D+" E="+E);break;}
    if(p==="unknown"){S++;if(S>10){console.log("STUCK");break;}await CD(page);await page.waitForTimeout(500);iN=false;continue;}
    S=0;
    if(p==="night"){if(!iN){N++;iN=true;}for(let s=0;s<80;s++){const p2=await phase(page);if(p2==="previewModal"){await CD(page);continue;}if(p2!=="night")break;const hb=page.locator('button:has-text("#")');const hc=await hb.count();if(hc>0&&hc<25){const bdy=await BT(page);const mn=bdy.match(/最少(\d+)个/);let need=mn?parseInt(mn[1]):1;need=Math.min(need,hc,2);for(let i=0;i<need;i++){if(await hb.nth(i).isEnabled({timeout:30}).catch(()=>false)){await hb.nth(i).click().catch(()=>{});await page.waitForTimeout(80);}}}if(await page.locator('button:has-text("天亮了")').isVisible({timeout:30}).catch(()=>false)){await page.locator('button:has-text("天亮了")').click();await page.waitForTimeout(400);}else if(await page.locator('button:has-text("确认 & 下一步")').isVisible({timeout:30}).catch(()=>false)){if(await page.locator('button:has-text("确认 & 下一步")').isEnabled({timeout:30}).catch(()=>false)){await page.locator('button:has-text("确认 & 下一步")').click();await page.waitForTimeout(300);}else{await page.waitForTime