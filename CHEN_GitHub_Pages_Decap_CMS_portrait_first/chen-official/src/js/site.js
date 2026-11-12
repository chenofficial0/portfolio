(() => {
  'use strict';
  const strings = {
    zh: {viewWork:'查看作品',portraitPending:'形象照片待補',introLead:'演員資料',birthYear:'出生年份',basedIn:'所屬地區',languages:'語言能力',noWorks:'作品資料準備中',modelCardHint:'線上預覽與 PDF 下載',actorProfileHint:'演員履歷 PDF',preview:'預覽',download:'下載 PDF',comingSoon:'資料準備中',showreelHint:'演出片段',watch:'觀看 ↗',noPhotos:'攝影作品準備中',collaboration:'合作邀約',contactTypes:'演出邀約 · 廣告與品牌合作 · 平面模特合作 · 經紀及商務聯繫',emailPending:'工作信箱待補',openPdf:'另開 PDF ↗',pdfFallback:'若裝置無法直接顯示 PDF，請選擇「另開 PDF」。',production:'製作公司／品牌',role:'擔任角色',year:'年份',type:'演出類型',video:'觀看影片 ↗',close:'關閉'},
    en: {viewWork:'VIEW WORK',portraitPending:'PORTRAIT TO BE ADDED',introLead:'Actor profile',birthYear:'BIRTH YEAR',basedIn:'BASED IN',languages:'LANGUAGES',noWorks:'SELECTED WORKS WILL APPEAR HERE.',modelCardHint:'Preview online and download PDF.',actorProfileHint:'Actor résumé in PDF format.',preview:'PREVIEW',download:'DOWNLOAD PDF',comingSoon:'COMING SOON',showreelHint:'Selected performance clips.',watch:'WATCH ↗',noPhotos:'SELECTED PHOTOGRAPHS WILL APPEAR HERE.',collaboration:'FOR COLLABORATIONS & INQUIRIES',contactTypes:'Acting · Commercial & Brand · Modeling · Management',emailPending:'WORK EMAIL TO BE ADDED',openPdf:'OPEN PDF ↗',pdfFallback:'If your device cannot display the PDF, use OPEN PDF.',production:'Production / Brand',role:'Role',year:'Year',type:'Category',video:'WATCH VIDEO ↗',close:'Close'},
    ko: {viewWork:'작품 보기',portraitPending:'프로필 사진 준비 중',introLead:'배우 프로필',birthYear:'출생 연도',basedIn:'활동 지역',languages:'언어',noWorks:'작품 정보 준비 중',modelCardHint:'온라인 미리보기 및 PDF 다운로드',actorProfileHint:'배우 이력서 PDF',preview:'미리보기',download:'PDF 다운로드',comingSoon:'준비 중',showreelHint:'연기 영상',watch:'영상 보기 ↗',noPhotos:'갤러리 준비 중',collaboration:'캐스팅 및 협업 문의',contactTypes:'출연 · 광고 및 브랜드 · 모델 · 매니지먼트',emailPending:'업무용 이메일 준비 중',openPdf:'PDF 열기 ↗',pdfFallback:'PDF가 표시되지 않으면 「PDF 열기」를 이용해 주세요.',production:'제작사 / 브랜드',role:'배역',year:'연도',type:'유형',video:'영상 보기 ↗',close:'닫기'}
  };
  let content = {};
  try { content = JSON.parse(document.querySelector('#site-content')?.textContent || '{}'); } catch (_) {}
  const about = content.about || {};
  const i18n = (k) => (strings[language] || strings.zh)[k] || k;
  let savedLanguage = 'zh';
  try { savedLanguage = localStorage.getItem('chen-lang') || 'zh'; } catch (_) {}
  let language = ['zh','en','ko'].includes(savedLanguage) ? savedLanguage : 'zh';
  const choose = (obj, base) => obj?.[`${base}_${language}`] || obj?.[`${base}_zh`] || obj?.[base] || '';
  function applyLanguage(lang) {
    language = lang;
    try { localStorage.setItem('chen-lang',lang); } catch (_) {}
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang;
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.querySelectorAll('[data-i18n]').forEach(node => node.textContent=i18n(node.dataset.i18n));
    const bio = document.getElementById('bio');
    if (bio) bio.textContent = choose(about,'bio');
    document.querySelectorAll('[data-work]').forEach(card => {
      try { const w = JSON.parse(card.dataset.work); card.querySelector('.work-title').textContent=choose(w,'title');const role=card.querySelector('.work-role');if (role) role.textContent=choose(w,'role'); }
      catch (_) {}
    });
  }
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click',() => applyLanguage(b.dataset.lang)));
  applyLanguage(language);

  const filters = document.querySelectorAll('[data-filter]');
  filters.forEach(b => b.addEventListener('click',() => {
    filters.forEach(x => x.classList.toggle('active',x===b));
    document.querySelectorAll('.work').forEach(card => card.hidden = b.dataset.filter !== 'all' && card.dataset.category !== b.dataset.filter);
  }));

  const workDialog = document.getElementById('work-dialog');
  const detail = document.getElementById('work-dialog-body');
  const el = (tag,cls,content) => { const node=document.createElement(tag);if(cls)node.className=cls;if(content != null)node.textContent=String(content);return node; };
  function appendMeta(container,label,value){if(!value)return;const row=el('div','detail-meta');row.append(el('span','',label),el('span','',value));container.append(row);}
  function isSafeUrl(url){try {const u=new URL(url,window.location.href);return u.protocol==='https:' || u.protocol==='http:' && u.hostname==='localhost';}catch(_){return false;}}
  document.querySelectorAll('.work-open').forEach(button => button.addEventListener('click',()=>{
    const card=button.closest('[data-work]');if(!card||!workDialog)return;
    let w;try{w=JSON.parse(card.dataset.work)}catch(_){return}
    detail.replaceChildren();
    if(w.cover && isSafeUrl(w.cover)) {const img=el('img','detail-img');img.src=w.cover;img.alt=choose(w,'title');detail.append(img)}
    detail.append(el('span','detail-kind',`${w.category || ''} / ${w.year || ''}`),el('h2','detail-title',choose(w,'title')));
    appendMeta(detail,i18n('production'),w.production);
    appendMeta(detail,i18n('role'),choose(w,'role'));
    appendMeta(detail,i18n('year'),w.year);
    if(Array.isArray(w.stills) && w.stills.length){const gallery=el('div','detail-gallery');w.stills.forEach(item=>{if(item.image && isSafeUrl(item.image)){const img=el('img');img.loading='lazy';img.src=item.image;img.alt=item.caption||choose(w,'title');gallery.append(img)}}); detail.append(gallery)}
    if(w.video_url && isSafeUrl(w.video_url)){const a=el('a','detail-link',w.video_label || i18n('video'));a.href=w.video_url;a.target='_blank';a.rel='noopener noreferrer';detail.append(a)}
    workDialog.showModal();
  }));
  const pdfDialog=document.getElementById('pdf-dialog');
  document.querySelectorAll('[data-pdf]').forEach(b=>b.addEventListener('click',()=>{
    if(!isSafeUrl(b.dataset.pdf)||!pdfDialog)return;
    const frame=document.getElementById('pdf-frame');frame.src=b.dataset.pdf;
    const ext=document.getElementById('pdf-external');ext.href=b.dataset.pdf;
    pdfDialog.showModal();
  }));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog')?.close()));
  [workDialog,pdfDialog].forEach(dialog=>{if(!dialog)return;dialog.addEventListener('click',(e)=>{if(e.target===dialog)dialog.close()});dialog.addEventListener('close',()=>{if(dialog===pdfDialog)document.getElementById('pdf-frame').src='about:blank'})});
})();
