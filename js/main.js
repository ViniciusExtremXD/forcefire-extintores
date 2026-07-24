/* ==========================================================================
   FORCEFIRE EXTINTORES — interações e motion
   ========================================================================== */
(function () {
  'use strict';

  // Reforço do "sempre abre no topo" para quando o navegador restaura a
  // página do cache (voltar/avançar) sem reexecutar o script inline do <head>.
  window.addEventListener('pageshow', () => {
    if (!location.hash) window.scrollTo(0, 0);
  });

  // ?motion=0 força motion desligado; ?motion=1 força ligado (ambos para QA)
  const motionParam = new URLSearchParams(location.search).get('motion');
  const motionOff = motionParam === '0';
  const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Decisão do cliente ("usar e abusar do motion"): o motion decorativo
  // (reveals, contadores, títulos, slider, smooth-scroll) roda sempre — só o
  // modo de QA (?motion=0) desliga. O canvas de brasas, por ser pesado e
  // contínuo, ainda respeita prefers-reduced-motion do SO (embersOff).
  const prefersReducedMotion = motionOff;
  const embersOff = motionOff || (motionParam !== '1' && osReduced);
  if (motionOff) document.documentElement.classList.add('motion-off');
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  /* ---------- Header: estado de scroll + barra de progresso ---------- */
  const header = document.getElementById('header');
  const progress = document.getElementById('scrollProgress');

  // Histerese: liga em 40px e só desliga abaixo de 14px — um único limiar
  // faz a classe ligar/desligar em rajada quando o scroll oscila perto dele.
  let headerScrolled = false;
  function onScroll() {
    const y = window.scrollY;
    if (!headerScrolled && y > 40) headerScrolled = true;
    else if (headerScrolled && y < 14) headerScrolled = false;
    header.classList.toggle('is-scrolled', headerScrolled);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    updateSpy();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Scroll spy ---------- */
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  // Ordena por posição no documento: #licenciamento fica dentro de #servicos,
  // e a ordem do menu não bate com a ordem das seções na página.
  const spyTargets = navLinks
    .map(link => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

  function updateSpy() {
    const probe = window.scrollY + 160;
    let current = spyTargets[0];
    for (const el of spyTargets) {
      if (el.getBoundingClientRect().top + window.scrollY <= probe) current = el;
    }
    navLinks.forEach(link => {
      const active = link.getAttribute('href') === '#' + current.id;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  /* ---------- Nav mobile (overlay com Esc + trava de foco) ---------- */
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  const mqDesktop = window.matchMedia('(min-width: 1081px)');

  function setNav(open) {
    nav.classList.toggle('is-open', open);
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    // classe no body esconde WhatsApp flutuante e barra de progresso sob o overlay
    document.body.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    // A barra de progresso (z alto) não obedecia à regra CSS de forma confiável —
    // garante esconder por inline enquanto o overlay do menu está aberto.
    if (progress) progress.parentElement.style.visibility = open ? 'hidden' : '';
  }
  function openNav() {
    setNav(true);
    (nav.querySelector('.nav-link') || nav).focus({ preventScroll: true });
  }
  function closeNav(restoreFocus) {
    setNav(false);
    if (restoreFocus) navToggle.focus();
  }

  navToggle.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) closeNav(); else openNav();
  });
  nav.addEventListener('click', e => {
    if (e.target.closest('.nav-link') && nav.classList.contains('is-open')) closeNav();
  });
  // Esc fecha o menu e devolve o foco ao botão (padrão de diálogo)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav(true);
  });
  // Contém o Tab dentro do overlay enquanto aberto (foco não vaza para o <main>)
  nav.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !nav.classList.contains('is-open')) return;
    const items = nav.querySelectorAll('.nav-link');
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Cruzar para desktop com o menu aberto: fecha e restaura o scroll do body
  mqDesktop.addEventListener('change', e => { if (e.matches) closeNav(); });

  /* ---------- Hero slider ---------- */
  const hero = document.querySelector('.hero');
  const slides = Array.from(document.querySelectorAll('.hero-slider .slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dot'));
  const SLIDE_MS = 7000;
  let current = 0;
  let timer = null;

  function restartDot(dot) {
    const bar = dot.querySelector('b s');
    bar.style.animation = 'none';
    void bar.offsetWidth; // força reflow para reiniciar a animação
    bar.style.animation = '';
  }

  function goTo(index, fromUser) {
    const next = (index + slides.length) % slides.length;
    if (next === current && fromUser) return;
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');
    dots[current].removeAttribute('aria-current');
    current = next;
    slides[current].classList.add('is-active');
    dots[current].classList.add('is-active');
    dots[current].setAttribute('aria-current', 'true');
    restartDot(dots[current]);
    hero.classList.toggle('on-light', slides[current].classList.contains('slide-light'));
    schedule();
  }

  // Estados de pausa: botão do usuário (persistente), hover, foco e aba oculta
  let userPaused = false;
  let hoverPaused = false;
  let focusPaused = false;

  function schedule() {
    clearTimeout(timer);
    if (prefersReducedMotion || userPaused || hoverPaused || focusPaused) return;
    timer = setTimeout(() => goTo(current + 1), SLIDE_MS);
  }

  function pauseAuto() {
    clearTimeout(timer);
    hero.classList.add('is-paused');
  }

  // Reinicia a barra do dot junto com o timer para não dessincronizar
  function resumeAuto() {
    if (userPaused || hoverPaused || focusPaused) return;
    hero.classList.remove('is-paused');
    restartDot(dots[current]);
    schedule();
  }

  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i, true)));

  // Botão pausar/retomar (WCAG 2.2.2 — visível também no touch/teclado)
  const pauseBtn = document.getElementById('heroPause');
  if (prefersReducedMotion) {
    pauseBtn.hidden = true;
  } else {
    // Nome acessível fixo + estado só via aria-pressed (padrão ARIA APG para
    // toggle) — não alternar o aria-label junto, que gera anúncio contraditório.
    pauseBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      pauseBtn.classList.toggle('is-paused', userPaused);
      pauseBtn.setAttribute('aria-pressed', String(userPaused));
      if (userPaused) {
        pauseAuto();
      } else {
        // O próprio botão mantém o foco dentro do hero; sem limpar focusPaused,
        // resumeAuto() retornaria cedo e a rotação nunca voltaria (teclado/touch).
        focusPaused = false;
        resumeAuto();
      }
    });
  }

  // Pausa no hover (desktop), no foco via teclado e quando a aba perde o foco
  if (finePointer) {
    hero.addEventListener('mouseenter', () => { hoverPaused = true; pauseAuto(); });
    hero.addEventListener('mouseleave', () => { hoverPaused = false; resumeAuto(); });
  }
  hero.addEventListener('focusin', e => {
    // O botão de pausa é o próprio controle — focá-lo não deve contar como
    // "pausa por foco", senão o clique de retomar não conseguiria retomar.
    if (e.target.closest && e.target.closest('#heroPause')) return;
    focusPaused = true;
    pauseAuto();
  });
  hero.addEventListener('focusout', e => {
    if (hero.contains(e.relatedTarget)) return;
    focusPaused = false;
    resumeAuto();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAuto(); else resumeAuto();
  });

  // Swipe no mobile (só troca slide se o gesto for mais horizontal que vertical)
  let touchX = null, touchY = null;
  hero.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  hero.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) goTo(current + (dx < 0 ? 1 : -1), true);
    touchX = touchY = null;
  }, { passive: true });

  // Teclado — ignora campos de formulário e só age com o hero na tela
  document.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = e.target;
    if (t instanceof Element && (t.closest('input, textarea, select') || t.isContentEditable)) return;
    const r = hero.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    goTo(current + (e.key === 'ArrowLeft' ? -1 : 1), true);
  });

  schedule();

  // O 1º slide já nasce com is-active no HTML (pra funcionar sem JS), então
  // a transição de entrada (crossfade + leve escala) nunca disparava nele.
  // Força o estado "antes" via inline style e libera em dois frames seguidos
  // para tocar a mesma transição também na primeira carga da página.
  if (!prefersReducedMotion) {
    const firstSlide = slides[current];
    firstSlide.style.transition = 'none';
    firstSlide.style.opacity = '0';
    firstSlide.style.transform = 'scale(1.035)';
    requestAnimationFrame(() => {
      firstSlide.style.transition = '';
      requestAnimationFrame(() => {
        firstSlide.style.opacity = '';
        firstSlide.style.transform = '';
      });
    });
  }

  /* ---------- Brasas (partículas) no hero ---------- */
  const canvas = document.getElementById('embers');
  if (canvas && !embersOff) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    let running = false;
    let raf = null;
    const COUNT = window.innerWidth < 768 ? 18 : 38;

    function resize() {
      canvas.width = hero.clientWidth;
      canvas.height = hero.clientHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function spawn(randomY) {
      return {
        x: Math.random() * canvas.width,
        y: randomY ? Math.random() * canvas.height : canvas.height + 8,
        r: 0.8 + Math.random() * 2.1,
        vy: 0.25 + Math.random() * 0.7,
        drift: 0.4 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.15 + Math.random() * 0.4,
        hue: Math.random() < 0.7 ? 4 + Math.random() * 14 : 24 + Math.random() * 14 // brasas vermelhas + fagulhas laranja
      };
    }
    particles = Array.from({ length: COUNT }, () => spawn(true));

    function tick(t) {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.y -= p.vy;
        p.x += Math.sin(t / 1400 + p.phase) * p.drift * 0.4;
        if (p.y < -10) Object.assign(p, spawn(false));
        const flicker = 0.75 + Math.sin(t / 220 + p.phase) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 58%, ${p.alpha * flicker})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }

    new IntersectionObserver(entries => {
      const inView = entries[0].isIntersecting;
      if (inView && !running) { running = true; raf = requestAnimationFrame(tick); }
      if (!inView && running) { running = false; cancelAnimationFrame(raf); }
    }, { threshold: 0.05 }).observe(hero);
  }

  /* ---------- Scroll reveal (com stagger) ---------- */
  // O stagger é aplicado via setTimeout (e não transition-delay) para não
  // atrasar as transições de hover dos cards depois do reveal.
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const delay = prefersReducedMotion ? 0 : parseInt(entry.target.dataset.revealDelay || '0', 10);
      if (delay) {
        setTimeout(() => entry.target.classList.add('is-visible'), delay);
      } else {
        entry.target.classList.add('is-visible');
      }
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.stagger').forEach(group => {
    Array.from(group.querySelectorAll('.reveal')).forEach((el, i) => {
      el.dataset.revealDelay = String(i * 90);
    });
  });

  /* ---------- Aparição de letras: títulos entram palavra a palavra ---------- */
  // Preserva <em> (gradiente) e <br> — cada palavra vira um <span class="rw">
  // que entra em cascata via --wi + transition-delay no CSS.
  if (!prefersReducedMotion) {
    document.querySelectorAll('.section-title, .avcb-copy h3, .cta-band h2, .insta-band h2').forEach(title => {
      let wi = 0;
      const frag = document.createDocumentFragment();
      Array.from(title.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'rw';
            w.style.setProperty('--wi', wi++);
            w.textContent = part;
            frag.appendChild(w);
          });
        } else if (node.nodeName === 'BR') {
          frag.appendChild(node.cloneNode());
        } else if (node.nodeName === 'EM') {
          const w = document.createElement('span');
          w.className = 'rw';
          w.style.setProperty('--wi', wi++);
          w.appendChild(node.cloneNode(true));
          frag.appendChild(w);
        } else {
          frag.appendChild(node.cloneNode(true));
        }
      });
      title.textContent = '';
      title.appendChild(frag);
      title.classList.add('split');
      if (!title.classList.contains('reveal')) revealObserver.observe(title);
    });
  }

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  /* ---------- Contadores ---------- */
  const counters = document.querySelectorAll('[data-count]');
  const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      counterObserver.unobserve(el);
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      if (prefersReducedMotion) { el.textContent = target + suffix; return; }
      const dur = 1600;
      const start = performance.now();
      (function step(now) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      })(start);
    });
  }, { threshold: 0.5 });
  counters.forEach(el => counterObserver.observe(el));

  /* ---------- Glow que segue o mouse ---------- */
  if (finePointer) {
    document.querySelectorAll('.glow-card').forEach(card => {
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
        card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
      });
    });
  }

  /* ---------- Botões magnéticos ---------- */
  if (finePointer && !prefersReducedMotion) {
    document.querySelectorAll('.btn-magnetic').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- Carrossel executivo de produtos ---------- */
  const showroom = document.getElementById('showroom');
  const showPrev = document.getElementById('showPrev');
  const showNext = document.getElementById('showNext');
  if (showroom && showPrev && showNext) {
    // Um card + o gap = passo de rolagem
    function stepSize() {
      const card = showroom.querySelector('.show-card');
      if (!card) return 320;
      const gap = parseFloat(getComputedStyle(showroom).columnGap) || 24;
      return card.getBoundingClientRect().width + gap;
    }
    function maxScroll() { return showroom.scrollWidth - showroom.clientWidth; }

    function updateArrows() {
      showPrev.disabled = showroom.scrollLeft <= 4;
      showNext.disabled = showroom.scrollLeft >= maxScroll() - 4;
    }
    showroom.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);

    let userTouched = false;
    function nudge(dir) {
      showroom.scrollBy({ left: dir * stepSize(), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
    showPrev.addEventListener('click', () => { userTouched = true; nudge(-1); });
    showNext.addEventListener('click', () => { userTouched = true; nudge(1); });
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(ev =>
      showroom.addEventListener(ev, () => { userTouched = true; }, { passive: true })
    );

    // Rotação automática suave: só com a seção visível, sem hover/foco,
    // e desiste para sempre na primeira interação manual do usuário.
    if (!prefersReducedMotion) {
      let visible = false;
      let hovering = false;
      new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }, { threshold: 0.4 }).observe(showroom);
      showroom.addEventListener('mouseenter', () => { hovering = true; });
      showroom.addEventListener('mouseleave', () => { hovering = false; });
      setInterval(() => {
        if (!visible || hovering || userTouched || document.hidden) return;
        if (showroom.contains(document.activeElement)) return;
        if (showroom.scrollLeft >= maxScroll() - 4) {
          showroom.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          nudge(1);
        }
      }, 5000);
    }
    updateArrows();
  }

  /* ---------- FAQ accordion animado (Web Animations API) ---------- */
  document.querySelectorAll('.faq-item').forEach(item => {
    const summary = item.querySelector('summary');
    const body = item.querySelector('.faq-body');

    summary.addEventListener('click', e => {
      e.preventDefault();
      if (item.hasAttribute('data-animating')) return;
      item.setAttribute('data-animating', '');

      if (item.open) {
        const anim = body.animate(
          [{ height: body.scrollHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
          { duration: prefersReducedMotion ? 0 : 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
        anim.onfinish = () => { item.open = false; item.removeAttribute('data-animating'); };
      } else {
        item.open = true;
        const anim = body.animate(
          [{ height: '0px', opacity: 0 }, { height: body.scrollHeight + 'px', opacity: 1 }],
          { duration: prefersReducedMotion ? 0 : 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
        anim.onfinish = () => { item.removeAttribute('data-animating'); };
      }
    });
  });

  /* ---------- Máscara de telefone (16) 9XXXX-XXXX ---------- */
  const telInput = document.getElementById('fTelefone');
  if (telInput) {
    telInput.addEventListener('input', () => {
      const d = telInput.value.replace(/\D/g, '').slice(0, 11);
      let out = '';
      if (d.length > 0) out = '(' + d.slice(0, 2);
      if (d.length >= 3) out += ') ' + d.slice(2, d.length >= 11 ? 7 : 6);
      if (d.length >= (d.length >= 11 ? 8 : 7)) out += '-' + d.slice(d.length >= 11 ? 7 : 6);
      telInput.value = out;
    });
  }

  /* ---------- Formulário → WhatsApp ---------- */
  const form = document.getElementById('quoteForm');
  const WHATS = '5516994088793';

  const formError = document.getElementById('formError');

  form.addEventListener('submit', e => {
    e.preventDefault();
    let firstInvalid = null;

    ['fNome', 'fTelefone', 'fServico'].forEach(id => {
      const input = document.getElementById(id);
      const field = input.closest('.field');
      // Telefone exige ao menos 10 dígitos (fixo) para não gerar lead com número inválido
      const ok = id === 'fTelefone'
        ? input.value.replace(/\D/g, '').length >= 10
        : input.value.trim() !== '';
      field.classList.toggle('has-error', !ok);
      if (!ok) {
        input.setAttribute('aria-invalid', 'true');
        if (!firstInvalid) firstInvalid = input;
      } else {
        input.removeAttribute('aria-invalid');
      }
    });
    if (firstInvalid) {
      formError.hidden = false;
      firstInvalid.focus();
      return;
    }
    formError.hidden = true;

    const nome = document.getElementById('fNome').value.trim();
    const tel = document.getElementById('fTelefone').value.trim();
    const servico = document.getElementById('fServico').value;
    const msg = document.getElementById('fMensagem').value.trim();

    const texto = [
      '🔥 *Orçamento — Site ForceFire*',
      '',
      `👤 *Nome/Empresa:* ${nome}`,
      `📱 *WhatsApp:* ${tel}`,
      `🧯 *Necessidade:* ${servico}`,
      msg ? `💬 *Mensagem:* ${msg}` : null
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${WHATS}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  });

  form.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      input.closest('.field').classList.remove('has-error');
      if (!form.querySelector('.has-error')) formError.hidden = true;
    });
  });

  /* ---------- Rolagem suave para "Solicitar Orçamento" e links de âncora ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.pushState) {
          history.pushState(null, '', href);
        }
      }
    });
  });

  /* ---------- Ano no rodapé ---------- */
  /* ---------- Smooth-scroll para âncoras internas (CTA, menu, hero) ---------- */
  // "Solicitar Orçamento" e demais links #ancora rolam suavemente até a seção,
  // respeitando o offset do header sticky (scroll-padding-top). Só ?motion=0 desliga.
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    const hash = link.getAttribute('href');
    if (!hash || hash.length < 2) return;
    link.addEventListener('click', e => {
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: motionOff ? 'auto' : 'smooth', block: 'start' });
      history.pushState(null, '', hash);
    });
  });

  /* ---------- Ano no rodapé ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  onScroll();
})();

