// ============================================================
// LOGIN & SIGNUP — LIGHT THEME LIQUID GLASS
// Real Email + Password Authentication, Registration, Lockout, and Reset
// ============================================================

function renderLogin(container, params = {}) {
  const pendingPrompt = params.pendingPrompt || null;
  let activeTab = 'signin';

  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;z-index:10;background:var(--bg-canvas);">
      
      <!-- Ambient blobs -->
      <div style="position:fixed;top:-80px;left:-60px;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,0.12) 0%,transparent 70%);pointer-events:none;z-index:0;"></div>
      <div style="position:fixed;bottom:-60px;right:-40px;width:350px;height:350px;border-radius:50%;background:radial-gradient(circle,rgba(124,58,237,0.08) 0%,transparent 70%);pointer-events:none;z-index:0;"></div>

      <!-- Back Button -->
      <button class="btn-glass" onclick="navigate('hero')" 
        style="position:fixed;top:20px;left:20px;padding:8px 16px;font-size:12.5px;z-index:100;">
        ← Back
      </button>

      <!-- Main Auth Card -->
      <div class="liquid-glass-elevated animate-fade-in" style="width:100%;max-width:500px;padding:36px;position:relative;z-index:10;">
        
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
          <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#0284C7,#38BDF8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:24px;box-shadow:0 4px 12px rgba(2,132,199,0.3);flex-shrink:0;">🚪</div>
          <div>
            <div style="font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#0F172A;" id="auth-card-title">Sign In to OneGate</div>
            <div style="font-size:13px;color:var(--tx-tertiary);margin-top:2px;" id="auth-card-desc">Enter your enterprise credentials to access your portal</div>
          </div>
        </div>

        <!-- Mode Toggle Pills -->
        <div style="display:flex;background:#F1F5F9;border-radius:10px;padding:3px;margin-bottom:20px;border:1px solid rgba(148,163,184,0.2);">
          <button type="button" id="tab-btn-signin" onclick="switchAuthTab('signin')"
            style="flex:1;padding:8px 12px;font-size:13px;font-weight:700;border-radius:8px;border:none;cursor:pointer;background:#FFFFFF;color:#0F172A;box-shadow:0 1px 3px rgba(0,0,0,0.06);transition:all 0.15s ease;">
            Sign In
          </button>
          <button hidden type="button" id="tab-btn-signup" disabled
            style="flex:1;padding:8px 12px;font-size:13px;font-weight:700;border-radius:8px;border:none;cursor:pointer;background:transparent;color:var(--tx-tertiary);transition:all 0.15s ease;">
            Company-managed accounts
          </button>
        </div>

        <!-- Alert Banner -->
        <div id="auth-alert" style="display:none;padding:12px 14px;border-radius:10px;font-size:13px;margin-bottom:18px;line-height:1.4;"></div>

        <!-- Presentation-only demo directory; identities are loaded server-side. -->
        <div id="auth-demo-access" style="margin-bottom:18px;padding:12px 14px;background:rgba(241,245,249,0.7);border:1px solid #E2E8F0;border-radius:14px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--tx-tertiary);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
            <span>Quick demo access</span>
            <span style="font-size:10px;color:#3f725a;font-weight:700;">28 presentation profiles</span>
          </div>
          <p id="demo-access-status" role="status" style="margin:0;color:#64786a;font-size:12px;">Loading demo profiles…</p>
          <div id="demo-featured" class="demo-featured" hidden></div>
          <details id="demo-directory" class="demo-directory" hidden>
            <summary>Choose any team member <span aria-hidden="true">↓</span></summary>
            <div class="demo-filters">
              <label>Role<select id="demo-role-filter"><option value="all">All roles</option></select></label>
              <label>Department<select id="demo-department-filter"><option value="all">All departments</option></select></label>
            </div>
            <label class="demo-person-label">Team member<select id="demo-account-select"></select></label>
            <button type="button" id="demo-login-selected" class="demo-login-selected">Open this workspace →</button>
          </details>
          <div id="demo-access-error" role="alert" hidden></div>
        </div>

        <!-- ─── Form 1: Sign In ────────────────────────────── -->
        <form id="signin-form" onsubmit="handleLoginSubmit(event)" style="display:flex;flex-direction:column;gap:16px;">
          <div>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--tx-secondary);margin-bottom:6px;">Work Email</label>
            <input type="email" id="login-email" required placeholder="your.name@company.com"
              style="width:100%;padding:11px 14px;font-size:14px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:rgba(255,255,255,0.7);color:#0F172A;box-sizing:border-box;outline:none;" />
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label style="font-size:12.5px;font-weight:700;color:var(--tx-secondary);">Password</label>
              <a href="#" onclick="showForgotPasswordModal(event)" style="font-size:12px;color:#0284C7;text-decoration:none;font-weight:600;">Forgot password?</a>
            </div>
            <input type="password" id="login-password" required placeholder="••••••••••••"
              style="width:100%;padding:11px 14px;font-size:14px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:rgba(255,255,255,0.7);color:#0F172A;box-sizing:border-box;outline:none;" />
          </div>

          <button type="submit" id="login-submit-btn" class="btn-primary-liquid"
            style="width:100%;padding:12px;font-size:14px;font-weight:700;margin-top:6px;cursor:pointer;border-radius:10px;">
            Sign In
          </button>
        </form>

        <!-- ─── Form 2: Sign Up ────────────────────────────── -->
        <form id="signup-form" onsubmit="handleSignupSubmit(event)" style="display:none;flex-direction:column;gap:14px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Full Name</label>
            <input type="text" id="signup-name" required placeholder="Jane Doe"
              style="width:100%;padding:10px 14px;font-size:13.5px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:rgba(255,255,255,0.7);color:#0F172A;box-sizing:border-box;outline:none;" />
          </div>

          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Work Email</label>
            <input type="email" id="signup-email" required placeholder="jane.doe@company.com"
              style="width:100%;padding:10px 14px;font-size:13.5px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:rgba(255,255,255,0.7);color:#0F172A;box-sizing:border-box;outline:none;" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Role</label>
              <select id="signup-role" onchange="handleSignupRoleChange(this.value)"
                style="width:100%;padding:10px 12px;font-size:13px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:#FFFFFF;color:#0F172A;outline:none;">
                <option value="employee" selected>Employee (Helpdesk Requester)</option>
                <option value="support_executive">Support Executive (Specialist)</option>
                <option value="department_manager">Department Manager</option>
                <option value="main_manager">Main Manager (Executive Org Lead)</option>
              </select>
            </div>

            <div id="signup-dept-group">
              <label id="signup-dept-label" style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Department</label>
              <select id="signup-dept"
                style="width:100%;padding:10px 12px;font-size:13px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:#FFFFFF;color:#0F172A;outline:none;">
                <option value="IT">IT Support</option>
                <option value="HR">People & HR</option>
                <option value="Finance">Finance & Payroll</option>
                <option value="Billing">Billing</option>
                <option value="Customer Support">Customer Support</option>
                <option value="Cybersecurity">Cybersecurity</option>
                <option value="Data & Analytics">Data & Analytics</option>
                <option value="Investor Relations">Investor Relations</option>
                <option value="Legal">Legal</option>
                <option value="Marketing">Marketing</option>
                <option value="Quality Assurance">Quality Assurance</option>
              </select>
              <div id="signup-dept-org-badge" style="display:none;padding:10px 12px;font-size:12.5px;font-weight:700;border-radius:10px;background:#F0F9FF;color:#0369A1;border:1px solid #BAE6FD;">
                🌐 All Departments (Org-Wide)
              </div>
            </div>
          </div>

          <div id="signup-tier-group" style="display:none;">
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Support Tier</label>
            <select id="signup-tier"
              style="width:100%;padding:10px 12px;font-size:13px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:#FFFFFF;color:#0F172A;outline:none;">
              <option value="L1">Level 1 support</option>
              <option value="L2" selected>Level 2 specialist</option>
              <option value="L3">Level 3 senior specialist</option>
            </select>
          </div>

          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--tx-secondary);margin-bottom:4px;">Password (min 12 chars)</label>
            <input type="password" id="signup-password" required placeholder="At least 12 chars, upper, digit, symbol"
              style="width:100%;padding:10px 14px;font-size:13.5px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:rgba(255,255,255,0.7);color:#0F172A;box-sizing:border-box;outline:none;" />
            <div style="font-size:11px;color:var(--tx-tertiary);margin-top:4px;">Must contain uppercase, lowercase, number, and special symbol.</div>
          </div>

          <button type="submit" id="signup-submit-btn" class="btn-primary-liquid"
            style="width:100%;padding:12px;font-size:14px;font-weight:700;margin-top:4px;cursor:pointer;border-radius:10px;">
            Create Account & Enter
          </button>
        </form>

        <!-- IT Security Note -->
        <div style="margin-top:20px;padding:12px 14px;border-radius:10px;background:rgba(2,132,199,0.04);border:1px solid rgba(2,132,199,0.12);font-size:11.5px;color:var(--tx-tertiary);line-height:1.4;">
          🔒 <strong>Enterprise Security Policy:</strong> Passwords must be at least 12 characters with upper, lower, number, and symbol. Account lockouts activate after 5 failed attempts within 15 minutes.
        </div>

      </div>

      <!-- Forgot Password Modal -->
      <div id="forgot-modal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,0.4);backdrop-filter:blur(6px);align-items:center;justify-content:center;z-index:200;padding:20px;">
        <div class="liquid-glass-elevated" style="width:100%;max-width:420px;padding:28px;background:#FFFFFF;border-radius:16px;">
          <h3 style="margin:0 0 8px;font-size:18px;color:#0F172A;">Reset Your Password</h3>
          <p style="font-size:13px;color:var(--tx-tertiary);margin:0 0 16px;">Enter your enterprise email to receive a password reset link.</p>
          <div id="forgot-alert" style="display:none;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:14px;"></div>
          <input type="email" id="forgot-email" placeholder="your.name@company.com"
            style="width:100%;padding:10px 12px;font-size:13.5px;border-radius:8px;border:1px solid #CBD5E1;margin-bottom:16px;box-sizing:border-box;" />
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn-glass" onclick="hideForgotPasswordModal()" style="padding:8px 16px;font-size:13px;">Cancel</button>
            <button class="btn-primary-liquid" onclick="handleForgotPasswordSubmit()" style="padding:8px 16px;font-size:13px;">Send Link</button>
          </div>
        </div>
      </div>

      <!-- Change Temporary Password Modal -->
      <div id="change-pwd-modal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,0.5);backdrop-filter:blur(8px);align-items:center;justify-content:center;z-index:250;padding:20px;">
        <div class="liquid-glass-elevated" style="width:100%;max-width:440px;padding:30px;background:#FFFFFF;border-radius:16px;">
          <h3 style="margin:0 0 8px;font-size:18px;color:#0F172A;">Change Temporary Password</h3>
          <p style="font-size:13px;color:var(--tx-tertiary);margin:0 0 16px;">Your account was provisioned with a temporary password. You must set a new permanent password to continue.</p>
          <div id="change-pwd-alert" style="display:none;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:14px;"></div>
          <form onsubmit="handleChangePasswordSubmit(event)" style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">Temporary Password</label>
              <input type="password" id="temp-current-pwd" required placeholder="Enter temporary password"
                style="width:100%;padding:10px 12px;font-size:13.5px;border-radius:8px;border:1px solid #CBD5E1;box-sizing:border-box;" />
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;">New Permanent Password (min 12 chars)</label>
              <input type="password" id="new-permanent-pwd" required placeholder="At least 12 chars, upper, digit, symbol"
                style="width:100%;padding:10px 12px;font-size:13.5px;border-radius:8px;border:1px solid #CBD5E1;box-sizing:border-box;" />
            </div>
            <button type="submit" class="btn-primary-liquid" style="width:100%;padding:10px;font-size:13.5px;font-weight:700;margin-top:6px;">
              Update Password & Continue
            </button>
          </form>
        </div>
      </div>

    </div>
  `;

  // ─── Handlers ────────────────────────────────────────────────
  const shell=container.firstElementChild;
  shell.classList.add('auth-refresh');
  const card=shell.querySelector('.liquid-glass-elevated');
  card.classList.add('auth-card');
  card.querySelector('#auth-card-title').classList.add('auth-title');
  card.querySelector('#auth-card-title').parentElement.previousElementSibling.classList.add('auth-emblem');
  card.querySelector('#auth-card-title').parentElement.previousElementSibling.textContent='O';
  card.querySelector('#tab-btn-signin').parentElement.classList.add('auth-tabs');
  card.querySelector('#auth-demo-access').classList.add('auth-demo');
  card.lastElementChild.classList.add('auth-security');
  const signupButton=document.getElementById('tab-btn-signup');
  signupButton.hidden=false;signupButton.disabled=false;signupButton.textContent='Sign up';signupButton.onclick=()=>window.switchAuthTab('signup');
  const signupForm=document.getElementById('signup-form');
  signupForm.innerHTML='<div class="auth-provision"><h3>Your company account starts here</h3><p>Ask your company administrator to create your OneGate account. They will assign your department and access, then share your work email and temporary password.</p><p>Already received your credentials? Sign in to activate your account and set your password.</p><button type="button" class="btn-primary-liquid" onclick="switchAuthTab(\'signin\')" style="width:100%;padding:12px;border-radius:12px">Activate your account →</button></div>';
  shell.insertAdjacentHTML('afterbegin','<section class="auth-story"><span class="live-note">ONEGATE / YOUR WORKDAY, CONNECTED</span><h1>Less searching.<br>More doing.</h1><p>Answers, approvals and the right people. Everything you need to move your workday forward.</p><div class="auth-story-image"><img src="https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=900&q=85" alt="Modern robotics and workplace technology"><span>✦ AI clarity. Human care.</span></div></section>');
  for(const input of card.querySelectorAll('input')){const label=input.parentElement.querySelector('label');if(label)label.htmlFor=input.id;input.autocomplete=input.type==='email'?'username':input.type==='password'?'current-password':'on';}
  const password=document.getElementById('login-password');
  const passwordWrapper=document.createElement('div');passwordWrapper.className='password-wrap';password.replaceWith(passwordWrapper);passwordWrapper.append(password);
  const visibility=document.createElement('button');visibility.type='button';visibility.className='password-toggle';visibility.textContent='Show';visibility.setAttribute('aria-label','Show password');visibility.onclick=()=>{const shown=password.type==='password';password.type=shown?'text':'password';visibility.textContent=shown?'Hide':'Show';visibility.setAttribute('aria-label',shown?'Hide password':'Show password');};passwordWrapper.append(visibility);
  document.getElementById('auth-alert').setAttribute('role','alert');
  let demoAccounts=[];
  const demoRoleOrder=['employee','support_executive','department_manager','main_manager'];
  const demoRoleIcon={employee:'👤',support_executive:'◉',department_manager:'▦',main_manager:'◇'};
  const syncDemoDirectory=()=>{
    const role=document.getElementById('demo-role-filter')?.value||'all';
    const department=document.getElementById('demo-department-filter')?.value||'all';
    const select=document.getElementById('demo-account-select');if(!select)return;
    const rows=demoAccounts.filter(a=>(role==='all'||a.role===role)&&(department==='all'||a.department===department));
    select.replaceChildren(...rows.map(account=>{const option=document.createElement('option');option.value=account.key;option.textContent=`${account.name} — ${account.department} · ${account.roleLabel}${account.tier?` · ${account.tier}`:''}`;return option;}));
    document.getElementById('demo-login-selected').disabled=!rows.length;
  };
  window.quickDemoLogin=async key=>{
    const button=document.querySelector(`[data-demo-key="${CSS.escape(key)}"]`)||document.getElementById('demo-login-selected');
    const error=document.getElementById('demo-access-error');
    if(error)error.hidden=true;if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Opening…';}
    try{
      const res=await fetch('/api/auth/demo-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
      const data=await res.json();if(!res.ok)throw new Error(data.message||'Demo profile is unavailable');
      window.PS18.user=data.user;if(data.token)localStorage.setItem('ps18_token',data.token);
      PS18.showToast(`Demo: ${data.user.name}`,'success');
      navigate((data.redirect||'/app/chat').replace('/app/',''),{pendingPrompt});
    }catch(err){if(error){error.hidden=false;error.textContent=err.message;}}
    finally{if(button&&button.isConnected){button.disabled=false;button.textContent=button.dataset.originalText||'Open this workspace →';}}
  };
  const loadDemoDirectory=async()=>{
    const region=document.getElementById('auth-demo-access'),status=document.getElementById('demo-access-status');
    try{
      const res=await fetch('/api/auth/demo-accounts');if(!res.ok)throw new Error('Demo mode is unavailable');
      const data=await res.json();demoAccounts=data.accounts||[];
      status.hidden=true;
      const featured=document.getElementById('demo-featured');
      const featuredKeys=['employee','it-specialist','it-manager','director'];
      featured.replaceChildren(...featuredKeys.map(key=>demoAccounts.find(a=>a.key===key)).filter(Boolean).map(account=>{
        const button=document.createElement('button');button.type='button';button.dataset.demoKey=account.key;button.onclick=()=>window.quickDemoLogin(account.key);
        const icon=document.createElement('span');icon.textContent=demoRoleIcon[account.role]||'○';
        const copy=document.createElement('span');const strong=document.createElement('strong');strong.textContent=account.name;const small=document.createElement('small');small.textContent=`${account.department} · ${account.roleLabel}`;copy.append(strong,small);button.append(icon,copy);return button;
      }));featured.hidden=false;
      const roleFilter=document.getElementById('demo-role-filter');
      const roles=[...new Set(demoAccounts.map(a=>a.role))].sort((a,b)=>demoRoleOrder.indexOf(a)-demoRoleOrder.indexOf(b));
      for(const role of roles){const option=document.createElement('option');option.value=role;option.textContent=demoAccounts.find(a=>a.role===role)?.roleLabel||role;roleFilter.append(option);}
      const deptFilter=document.getElementById('demo-department-filter');
      for(const dept of [...new Set(demoAccounts.map(a=>a.department))].sort()){const option=document.createElement('option');option.value=dept;option.textContent=dept;deptFilter.append(option);}
      roleFilter.onchange=syncDemoDirectory;deptFilter.onchange=syncDemoDirectory;
      document.getElementById('demo-login-selected').onclick=()=>window.quickDemoLogin(document.getElementById('demo-account-select').value);
      document.getElementById('demo-directory').hidden=false;syncDemoDirectory();
    }catch(err){region.hidden=true;}
  };
  loadDemoDirectory();

  window.switchAuthTab = (tab) => {
    if (!['signin','signup'].includes(tab)) return;
    activeTab = tab;
    const signinForm = document.getElementById('signin-form');
    const signupForm = document.getElementById('signup-form');
    const btnSignin = document.getElementById('tab-btn-signin');
    const btnSignup = document.getElementById('tab-btn-signup');
    const alertEl = document.getElementById('auth-alert');
    alertEl.style.display = 'none';

    if (tab === 'signup') {
      signinForm.style.display = 'none';
      signupForm.style.display = 'flex';
      btnSignup.style.background = '#FFFFFF';
      btnSignup.style.color = '#0F172A';
      btnSignup.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
      btnSignin.style.background = 'transparent';
      btnSignin.style.color = 'var(--tx-tertiary)';
      btnSignin.style.boxShadow = 'none';
      document.getElementById('auth-card-title').innerText = 'Join your workplace';
      document.getElementById('auth-card-desc').innerText = 'Get access through your company administrator';
    } else {
      signupForm.style.display = 'none';
      signinForm.style.display = 'flex';
      btnSignin.style.background = '#FFFFFF';
      btnSignin.style.color = '#0F172A';
      btnSignin.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
      btnSignup.style.background = 'transparent';
      btnSignup.style.color = 'var(--tx-tertiary)';
      btnSignup.style.boxShadow = 'none';
      document.getElementById('auth-card-title').innerText = 'Sign In to OneGate';
      document.getElementById('auth-card-desc').innerText = 'Enter your enterprise credentials to access your portal';
    }
  };

  window.handleSignupRoleChange = (role) => {
    const tierGroup = document.getElementById('signup-tier-group');
    const deptSelect = document.getElementById('signup-dept');
    const deptBadge = document.getElementById('signup-dept-org-badge');
    const deptLabel = document.getElementById('signup-dept-label');

    if (role === 'support_executive') {
      tierGroup.style.display = 'block';
    } else {
      tierGroup.style.display = 'none';
    }

    if (role === 'main_manager') {
      if (deptSelect) deptSelect.style.display = 'none';
      if (deptBadge) deptBadge.style.display = 'block';
      if (deptLabel) deptLabel.innerText = 'Scope';
    } else {
      if (deptSelect) deptSelect.style.display = 'block';
      if (deptBadge) deptBadge.style.display = 'none';
      if (deptLabel) deptLabel.innerText = 'Department';
    }
  };

  window.handleSignupSubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const role = document.getElementById('signup-role').value;
    const department = role === 'main_manager' ? 'All' : (document.getElementById('signup-dept')?.value || 'IT');
    const tier = document.getElementById('signup-tier')?.value || 'L1';
    const password = document.getElementById('signup-password').value;
    const submitBtn = document.getElementById('signup-submit-btn');
    const alertEl = document.getElementById('auth-alert');

    alertEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerText = 'Creating account...';

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, department, tier, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        alertEl.style.display = 'block';
        alertEl.style.background = '#FEF2F2';
        alertEl.style.color = '#B91C1C';
        alertEl.style.border = '1px solid #FECACA';
        alertEl.innerText = data.message || 'Unable to create account';
        submitBtn.disabled = false;
        submitBtn.innerText = 'Create Account & Enter';
        return;
      }

      window.PS18.user = data.user;
      if (data.token) localStorage.setItem('ps18_token', data.token);

      PS18.showToast(`Account created! Welcome, ${data.user.name}.`, 'success');

      const page = (data.redirect || '/app/chat').replace('/app/', '');
      navigate(page, { pendingPrompt });

    } catch (err) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#FEF2F2';
      alertEl.style.color = '#B91C1C';
      alertEl.style.border = '1px solid #FECACA';
      alertEl.innerText = 'Unable to connect to server. Please try again.';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Create Account & Enter';
    }
  };

  window.handleLoginSubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = document.getElementById('login-submit-btn');
    const alertEl = document.getElementById('auth-alert');

    alertEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerText = 'Authenticating...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.status === 423) {
        alertEl.style.display = 'block';
        alertEl.style.background = '#FFFBEB';
        alertEl.style.color = '#B45309';
        alertEl.style.border = '1px solid #FDE68A';
        alertEl.innerText = data.message;
        submitBtn.disabled = false;
        submitBtn.innerText = 'Sign In';
        return;
      }

      if (!res.ok) {
        alertEl.style.display = 'block';
        alertEl.style.background = '#FEF2F2';
        alertEl.style.color = '#B91C1C';
        alertEl.style.border = '1px solid #FECACA';
        alertEl.innerText = data.message || 'Invalid email or password.';
        submitBtn.disabled = false;
        submitBtn.innerText = 'Sign In';
        return;
      }

      window.PS18.user = data.user;
      if (data.token) localStorage.setItem('ps18_token', data.token);

      if (data.must_change_password) {
        document.getElementById('change-pwd-modal').style.display = 'flex';
        submitBtn.disabled = false;
        submitBtn.innerText = 'Sign In';
        return;
      }

      PS18.showToast(`Welcome back, ${data.user.name}!`, 'success');

      const page = (data.redirect || '/app/chat').replace('/app/', '');
      navigate(page, { pendingPrompt });

    } catch (err) {
      alertEl.style.display = 'block';
      alertEl.style.background = '#FEF2F2';
      alertEl.style.color = '#B91C1C';
      alertEl.style.border = '1px solid #FECACA';
      alertEl.innerText = 'Unable to connect to server. Please try again.';
      submitBtn.disabled = false;
      submitBtn.innerText = 'Sign In';
    }
  };

  window.showForgotPasswordModal = (e) => {
    if (e) e.preventDefault();
    document.getElementById('forgot-modal').style.display = 'flex';
  };

  window.hideForgotPasswordModal = () => {
    document.getElementById('forgot-modal').style.display = 'none';
  };

  window.handleForgotPasswordSubmit = async () => {
    const email = document.getElementById('forgot-email').value.trim();
    const alertEl = document.getElementById('forgot-alert');
    if (!email) return;

    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      alertEl.style.display = 'block';
      alertEl.style.background = '#F0FDF4';
      alertEl.style.color = '#15803D';
      alertEl.style.border = '1px solid #BBF7D0';
      alertEl.innerText = 'If an account exists, a reset link has been dispatched to your email.';
      setTimeout(() => hideForgotPasswordModal(), 3000);
    } catch (_) {}
  };

  window.handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('temp-current-pwd').value;
    const newPassword = document.getElementById('new-permanent-pwd').value;
    const alertEl = document.getElementById('change-pwd-alert');

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        alertEl.style.display = 'block';
        alertEl.style.background = '#FEF2F2';
        alertEl.style.color = '#B91C1C';
        alertEl.innerText = data.message || 'Password update failed';
        return;
      }

      document.getElementById('change-pwd-modal').style.display = 'none';
      PS18.showToast('Password updated successfully! Entering portal...', 'success');
      const role = window.PS18.user?.role;
      if (role === 'employee') navigate('chat');
      else if (role === 'support_executive') navigate('inbox');
      else navigate('manager');
    } catch (err) {
      alertEl.style.display = 'block';
      alertEl.innerText = 'Error updating password';
    }
  };
}

window.renderLogin = renderLogin;
