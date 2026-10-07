// ============================================================
// ONEGATE — PRODUCT FLOW EXPLAINER
// ============================================================

function renderHowItWorks(container) {
  container.tabIndex = 0;
  container.setAttribute('aria-label', 'How OneGate works');
  container.innerHTML = `
    <div class="flow-page">
      <div class="flow-grid" aria-hidden="true"></div>
      <header class="flow-nav">
        <button class="brand-lockup" onclick="navigate('hero')" aria-label="Back to OneGate home"><span class="brand-mark">O</span><span>onegate</span></button>
        <button class="flow-close" onclick="navigate('hero')">Back home <span>↗</span></button>
      </header>

      <main class="flow-main">
        <section class="flow-intro">
          <div class="flow-eyebrow"><span></span> One conversation. A complete route.</div>
          <h1>Here’s what happens<br><em>when work needs help.</em></h1>
          <p>OneGate works quietly in the background so you never have to decide which team, form, or system to use.</p>
        </section>

        <section class="route-stage" aria-label="How OneGate routes a request">
          <div class="route-line route-line-one"></div><div class="route-line route-line-two"></div><div class="route-pulse route-pulse-one"></div><div class="route-pulse route-pulse-two"></div>
          <article class="route-card route-request">
            <span class="route-number">01</span><span class="route-icon">⌁</span><h2>Say it your way</h2><p>“My VPN keeps dropping” is enough.</p>
          </article>
          <article class="route-card route-understand">
            <span class="route-number">02</span><span class="route-icon">✦</span><h2>OneGate understands</h2><p>It checks the right policy and the urgency.</p>
          </article>
          <article class="route-card route-outcome">
            <span class="route-number">03</span><span class="route-icon">↗</span><h2>You keep moving</h2><p>Get an answer, an action, or a prepared specialist.</p>
          </article>
          <div class="route-center"><span>OneGate</span><small>routing live</small></div>
        </section>

        <section class="flow-detail-grid">
          <article class="flow-detail-card flow-detail-answer">
            <span class="detail-kicker">When the answer is known</span>
            <h2>A clear answer.<br>No ticket.</h2>
            <div class="answer-preview"><span>OneGate</span><p>Here’s the policy and the next step.</p><b>Source checked</b></div>
          </article>
          <article class="flow-detail-card flow-detail-human">
            <span class="detail-kicker">When people are needed</span>
            <h2>A person joins<br>already informed.</h2>
            <div class="handoff-preview"><div><i></i><span>Specialist joined</span></div><p>Your context, priority, and earlier attempts travel with you.</p><b>Reply target · shown live</b></div>
          </article>
        </section>

        <section class="flow-destinations">
          <div><span class="detail-kicker">Designed for every side of work</span><h2>Same front door.<br>Different clarity.</h2></div>
          <div class="destination-list">
            <button onclick="handleChatLaunch()"><span>For employees</span><b>Ask and move on</b><i>→</i></button>
            <button onclick="navigate('login')"><span>For specialists</span><b>See context, not chaos</b><i>→</i></button>
            <button onclick="navigate('login')"><span>For leaders</span><b>See work moving</b><i>→</i></button>
          </div>
        </section>
      </main>
    </div>
  `;
}

window.renderHowItWorks = renderHowItWorks;
