// ============================================================
// ONEGATE — CINEMATIC, LIGHT-MODE FIRST IMPRESSION
// ============================================================

function renderHero(container) {
  const images = ['photo-1485827404703-89b55fcc595e','photo-1518770660439-4636190af475','photo-1550751827-4bd374c3f58b','photo-1451187580459-43490279c0fa'];
  const railFrames = dir => Array.from({length:25},(_,s)=>{const u=s/24,scale=(2.6/25)*Math.pow(46/2.6,u),z=30*(1-1/scale),rail=44-55*Math.pow(1-u,3.3);return `${u*100}%{transform:translate3d(${dir*rail}cqw,0,${z}cqw) rotateY(${-dir*(6+22*u)}deg)}`;}).join('');
  container.innerHTML = `
    <div class="hero-shell stream-hero">
      <style>@keyframes stream-right{${railFrames(1)}}@keyframes stream-left{${railFrames(-1)}}</style>
      <div class="image-corridor" aria-hidden="true"><div class="corridor-rails">${['right','left'].map(dir=>Array.from({length:9},(_,i)=>`<div class="stream-card" style="animation-name:stream-${dir};animation-delay:${-i*24/9}s"><img src="https://images.unsplash.com/${images[i%images.length]}?auto=format&fit=crop&w=700&q=80" alt="" decoding="async"></div>`).join('')).join('')}</div></div>
      <video class="hero-video" autoplay muted loop playsinline poster="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=85" aria-hidden="true">
        <source src="https://cdn.coverr.co/videos/coverr-a-person-typing-on-a-laptop-1570/1080p.mp4" type="video/mp4">
      </video>
      <div class="hero-video-wash" aria-hidden="true"></div>
      <div class="hero-orb hero-orb-one" aria-hidden="true"></div>
      <div class="hero-orb hero-orb-two" aria-hidden="true"></div>

      <header class="hero-nav">
        <button class="brand-lockup" onclick="navigate('hero')" aria-label="OneGate home">
          <span class="brand-mark">O</span><span>onegate</span>
        </button>
        <div class="hero-nav-actions">
          <button class="nav-text-button" onclick="navigate('login')">Sign in</button>
          <button class="hero-cta-small" onclick="handleChatLaunch()">Open OneGate <span>↗</span></button>
        </div>
      </header>

      <main class="hero-stage">
        <div class="hero-copy">
          <div class="live-note"><span></span> Your workday, unblocked</div>
          <h1>Your work.<br><em>Front and centre.</em></h1>
          <p>Ask once. Get the answer, the action, or the right person — without hunting for the right door.</p>
          <div class="hero-action-row">
            <button class="hero-primary" onclick="handleChatLaunch()">Start a conversation <span>→</span></button>
            <button class="hero-quiet-action" onclick="navigate('how-it-works')">See how it works <span>→</span></button>
          </div>
        </div>

        <div class="hero-desk" aria-label="OneGate quick question">
          <div class="desk-topline"><span class="mini-spark">✦</span><span>OneGate Assistant</span><span class="desk-online">Online</span></div>
          <div class="desk-conversation">
            <div class="desk-bubble user">I need help with my workday</div>
            <div class="desk-bubble assistant">I know where to start.</div>
          </div>
          <button class="desk-prompt" onclick="handleChatLaunch('I need help with my workday')"><span>What can we solve?</span><b>→</b></button>
        </div>
      </main>

      <section class="hero-bottom">
        <div class="hero-scroll-label">Built for the moments between work <span>↓</span></div>
        <div class="hero-path">
          <div><span class="path-number">01</span><strong>Ask naturally</strong></div>
          <i></i>
          <div><span class="path-number">02</span><strong>Get clarity</strong></div>
          <i></i>
          <div><span class="path-number">03</span><strong>Keep moving</strong></div>
        </div>
      </section>

      <div class="hero-corner-tag">AI support · Human when it matters</div>
      <button class="stream-motion" type="button" aria-pressed="false" onclick="const paused=this.closest('.stream-hero').classList.toggle('motion-paused');this.setAttribute('aria-pressed',String(paused));this.textContent=paused?'Play motion':'Pause motion'">Pause motion</button>
    </div>
  `;
}

function handleChatLaunch(promptText = '') {
  if (!PS18.user) {
    navigate('login', { preselectRole: 'user', pendingPrompt: promptText || 'Hello! What can you help me with?' });
  } else {
    navigate('chat', { initialPrompt: promptText });
  }
}

window.renderHero = renderHero;
window.handleChatLaunch = handleChatLaunch;
