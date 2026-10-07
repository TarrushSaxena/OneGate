// ============================================================
// NAIVE BAYES DEPARTMENT CLASSIFIER (v2 — 10 Departments)
// Trained from scratch on KB article keywords
// Classifies: IT | HR | Finance | Facilities | Cybersecurity
//             | Legal | Customer Support | Marketing
//             | Data Analytics | Billing
// ============================================================

class NaiveBayesClassifier {
  constructor() {
    this.classes = [
      'IT', 'HR', 'Finance', 'Facilities',
      'Cybersecurity', 'Legal', 'Customer Support',
      'Marketing', 'Data Analytics', 'Billing',
    ];
    this.classCounts = {};
    this.wordCounts = {};
    this.totalWords = {};
    this.vocabulary = new Set();
    this.totalDocs = 0;
    this.classDocs = {};
    this.smoothing = 1; // Laplace smoothing

    this.classes.forEach(c => {
      this.classCounts[c] = 0;
      this.wordCounts[c] = {};
      this.totalWords[c] = 0;
      this.classDocs[c] = 0;
    });

    // Training data: [text, label]
    this.trainingData = this._buildTrainingData();
    this._train();
  }

  _buildTrainingData() {
    return [
      // ── IT training samples (25) ──────────────────────────
      ['vpn not working connection dropped remote access tunnel', 'IT'],
      ['password reset locked account login credentials forgot', 'IT'],
      ['laptop screen hardware driver update battery charger', 'IT'],
      ['wifi wireless network internet connection slow', 'IT'],
      ['software install application license excel word teams', 'IT'],
      ['email outlook setup configure mobile device iphone android', 'IT'],
      ['printer setup peripheral usb webcam monitor display', 'IT'],
      ['mfa two factor authentication authenticator app google', 'IT'],
      ['onedrive sharepoint cloud storage files sync backup', 'IT'],
      ['remote desktop rdp access workstation computer', 'IT'],
      ['video conferencing zoom teams meeting camera microphone', 'IT'],
      ['server down outage maintenance database error 500', 'IT'],
      ['network firewall port blocked access denied connectivity', 'IT'],
      ['windows mac operating system update patch crash blue screen', 'IT'],
      ['keyboard mouse not working peripheral device driver', 'IT'],
      ['monitor display external screen resolution flickering', 'IT'],
      ['internet slow bandwidth speed performance latency', 'IT'],
      ['account disabled suspended deactivated blocked user', 'IT'],
      ['data recovery deleted files restore backup', 'IT'],
      ['new laptop request hardware refresh replacement macbook dell', 'IT'],
      ['docking station external monitor setup dual screen', 'IT'],
      ['headset webcam jabra logitech audio video setup', 'IT'],
      ['shared mailbox distribution list email group create', 'IT'],
      ['intune enrollment company portal mobile device management', 'IT'],
      ['service desk ticket helpdesk it support request', 'IT'],

      // ── HR training samples (25) ──────────────────────────
      ['pto vacation days leave balance time off request', 'HR'],
      ['payroll salary payment direct deposit paycheck wage', 'HR'],
      ['performance review rating appraisal feedback evaluation', 'HR'],
      ['benefits enrollment health insurance dental vision 401k', 'HR'],
      ['wfh work from home remote hybrid flexible schedule', 'HR'],
      ['onboarding new hire orientation first day welcome', 'HR'],
      ['resignation resign quit termination offboarding exit', 'HR'],
      ['promotion raise merit increase compensation career growth', 'HR'],
      ['harassment complaint grievance ethics workplace conduct', 'HR'],
      ['parental leave maternity paternity family medical', 'HR'],
      ['sick leave doctor appointment medical absence', 'HR'],
      ['training development learning course certification degree', 'HR'],
      ['employee handbook policy code of conduct rules', 'HR'],
      ['dress code professional attire appearance office', 'HR'],
      ['referral employee program bonus hiring recruitment', 'HR'],
      ['w2 tax form withholding payslip stub annual income', 'HR'],
      ['address update personal information profile change', 'HR'],
      ['mental health wellness eap counseling support burnout', 'HR'],
      ['overtime hours tracking timesheet attendance clock', 'HR'],
      ['diversity inclusion equity culture engagement survey', 'HR'],
      ['employment verification letter salary certificate', 'HR'],
      ['pip performance improvement plan warning probation', 'HR'],
      ['buddy program mentor new joiner welcome kit', 'HR'],
      ['exit interview last day formalities experience letter', 'HR'],
      ['background check verification reference', 'HR'],

      // ── Finance training samples (20) ─────────────────────
      ['expense report reimbursement receipt concur submit', 'Finance'],
      ['purchase order procurement vendor approval coupa', 'Finance'],
      ['budget forecast planning actuals variance spending', 'Finance'],
      ['corporate card credit card amex expense travel', 'Finance'],
      ['travel booking hotel flight per diem allowance', 'Finance'],
      ['refund charge dispute transaction unauthorized', 'Finance'],
      ['tax audit compliance sox financial reporting', 'Finance'],
      ['salary advance loan financial assistance', 'Finance'],
      ['capex opex capital expenditure operating cost', 'Finance'],
      ['wire transfer bank ach payment international', 'Finance'],
      ['grant budget transfer reallocation finance', 'Finance'],
      ['profit loss revenue cost center department spend', 'Finance'],
      ['quarterly close financial statements reconciliation', 'Finance'],
      ['depreciation amortization fixed asset schedule', 'Finance'],
      ['petty cash reimbursement small expense receipt', 'Finance'],
      ['travel pre approval trip authorization business travel', 'Finance'],
      ['mileage reimbursement personal vehicle fuel claim', 'Finance'],
      ['accounts payable vendor payment due net 30', 'Finance'],
      ['cost center budget owner department spending limit', 'Finance'],
      ['gst vat tax invoice input credit compliance', 'Finance'],

      // ── Facilities training samples (20) ──────────────────
      ['badge access building door security entry pass', 'Facilities'],
      ['desk booking hot desk office space reservation seat', 'Facilities'],
      ['meeting room conference hall book schedule availability', 'Facilities'],
      ['temperature hvac air conditioning heating cold hot', 'Facilities'],
      ['maintenance repair broken fix cleaning janitor', 'Facilities'],
      ['parking garage car spot ev charging electric vehicle', 'Facilities'],
      ['emergency fire evacuation safety drill alarm', 'Facilities'],
      ['visitor guest registration lobby reception sign in', 'Facilities'],
      ['mail package delivery courier receive send', 'Facilities'],
      ['office supplies stationery printer paper ink toner', 'Facilities'],
      ['lights bulb electricity power outlet socket', 'Facilities'],
      ['elevator lift floor escalator building lobby', 'Facilities'],
      ['cafeteria kitchen coffee machine food pantry', 'Facilities'],
      ['noise complaint loud disturbance environment office', 'Facilities'],
      ['waste recycling trash bin disposal environment', 'Facilities'],
      ['locker storage personal belongings office space', 'Facilities'],
      ['catering food order team lunch event setup', 'Facilities'],
      ['standing desk ergonomic chair furniture request', 'Facilities'],
      ['shuttle bus transport commute campus', 'Facilities'],
      ['smoking zone designated area building exterior', 'Facilities'],

      // ── Cybersecurity training samples (15) ────────────────
      ['phishing email suspicious link clicked report', 'Cybersecurity'],
      ['malware virus ransomware infected machine compromised', 'Cybersecurity'],
      ['data breach leak sensitive information exposed', 'Cybersecurity'],
      ['suspicious login unauthorized access account compromised hacked', 'Cybersecurity'],
      ['usb drive found unknown device plugged security risk', 'Cybersecurity'],
      ['password stolen credentials leaked dark web', 'Cybersecurity'],
      ['social engineering impersonation fake call vishing', 'Cybersecurity'],
      ['security incident report breach p1 p2 critical', 'Cybersecurity'],
      ['mfa push notification didnt request approve deny', 'Cybersecurity'],
      ['laptop stolen lost device data wipe remote lock', 'Cybersecurity'],
      ['tor vpn unauthorized proxy bypass firewall evasion', 'Cybersecurity'],
      ['insider threat employee data exfiltration download', 'Cybersecurity'],
      ['sms otp code request fake smishing attack', 'Cybersecurity'],
      ['ransom note screen locked encrypted pay bitcoin', 'Cybersecurity'],
      ['security awareness training compliance phishing test', 'Cybersecurity'],

      // ── Legal training samples (15) ────────────────────────
      ['nda non disclosure agreement confidentiality sign', 'Legal'],
      ['contract review vendor agreement terms conditions', 'Legal'],
      ['intellectual property patent trademark copyright', 'Legal'],
      ['data privacy gdpr ccpa personal data processing', 'Legal'],
      ['litigation lawsuit dispute court legal action', 'Legal'],
      ['regulatory compliance license permit regulation', 'Legal'],
      ['employee agreement offer letter non compete clause', 'Legal'],
      ['subpoena legal hold document preservation notice', 'Legal'],
      ['corporate governance board resolution shareholder', 'Legal'],
      ['merger acquisition due diligence legal review', 'Legal'],
      ['whistleblower protection retaliation anonymous report', 'Legal'],
      ['terms of service privacy policy user agreement update', 'Legal'],
      ['software license open source gpl apache compliance', 'Legal'],
      ['vendor contract renewal sla penalty breach', 'Legal'],
      ['power of attorney authorization delegation legal', 'Legal'],

      // ── Customer Support training samples (15) ─────────────
      ['customer complaint unhappy product issue escalation', 'Customer Support'],
      ['refund request order cancelled return product', 'Customer Support'],
      ['sla violation response time customer waiting', 'Customer Support'],
      ['customer feedback nps csat satisfaction rating', 'Customer Support'],
      ['onboarding customer new client setup configuration', 'Customer Support'],
      ['account manager client relationship enterprise', 'Customer Support'],
      ['zendesk freshdesk ticket customer external', 'Customer Support'],
      ['product demo trial customer evaluation poc', 'Customer Support'],
      ['customer churn retention renewal subscription cancel', 'Customer Support'],
      ['support sla tier priority customer external issue', 'Customer Support'],
      ['product feature request customer ask roadmap', 'Customer Support'],
      ['customer data export migration import account', 'Customer Support'],
      ['customer training webinar documentation help guide', 'Customer Support'],
      ['enterprise client escalation vp director executive', 'Customer Support'],
      ['customer success health score engagement adoption', 'Customer Support'],

      // ── Marketing training samples (15) ────────────────────
      ['brand guidelines logo usage typography colors', 'Marketing'],
      ['campaign launch social media content blog post', 'Marketing'],
      ['press release media coverage news announcement', 'Marketing'],
      ['event booth conference sponsorship trade show', 'Marketing'],
      ['seo sem google ads paid search organic traffic', 'Marketing'],
      ['email marketing campaign newsletter subscriber', 'Marketing'],
      ['content approval blog whitepaper case study', 'Marketing'],
      ['brand asset template presentation slide deck', 'Marketing'],
      ['social media linkedin twitter instagram post', 'Marketing'],
      ['webinar registration virtual event promotion', 'Marketing'],
      ['marketing collateral brochure flyer banner print', 'Marketing'],
      ['competitive analysis market research industry trend', 'Marketing'],
      ['analytics dashboard google analytics campaign performance', 'Marketing'],
      ['lead generation funnel conversion pipeline', 'Marketing'],
      ['product launch go to market strategy positioning', 'Marketing'],

      // ── Data Analytics training samples (15) ───────────────
      ['dashboard report data visualization tableau powerbi', 'Data Analytics'],
      ['sql query database extract report generate', 'Data Analytics'],
      ['data pipeline etl extract transform load airflow', 'Data Analytics'],
      ['metrics kpi tracking conversion funnel analysis', 'Data Analytics'],
      ['data warehouse snowflake redshift bigquery', 'Data Analytics'],
      ['machine learning model prediction training inference', 'Data Analytics'],
      ['ab test experiment statistical significance', 'Data Analytics'],
      ['data access permission dataset view download', 'Data Analytics'],
      ['report scheduled automated email daily weekly', 'Data Analytics'],
      ['cohort analysis user segmentation retention', 'Data Analytics'],
      ['data quality missing values duplicate records clean', 'Data Analytics'],
      ['executive summary board deck metrics quarterly', 'Data Analytics'],
      ['real time streaming analytics kafka events', 'Data Analytics'],
      ['forecast prediction trend regression time series', 'Data Analytics'],
      ['jupyter notebook python pandas analysis sandbox', 'Data Analytics'],

      // ── Billing training samples (15) ──────────────────────
      ['invoice customer billing payment due outstanding', 'Billing'],
      ['payment terms net 30 60 90 overdue past due', 'Billing'],
      ['credit memo adjustment write off bad debt', 'Billing'],
      ['subscription billing recurring charge monthly annual', 'Billing'],
      ['accounts receivable collection follow up aging', 'Billing'],
      ['proration upgrade downgrade plan change mid cycle', 'Billing'],
      ['tax invoice gst vat exempt tax id', 'Billing'],
      ['billing dispute incorrect charge overcharge', 'Billing'],
      ['payment gateway stripe razorpay transaction failed', 'Billing'],
      ['dunning retry failed payment card expired', 'Billing'],
      ['revenue recognition deferred revenue accrual', 'Billing'],
      ['pricing quote proposal discount negotiation', 'Billing'],
      ['customer billing portal self service invoice download', 'Billing'],
      ['currency conversion multi currency exchange rate', 'Billing'],
      ['renewal billing auto renew contract expiry', 'Billing'],
    ];
  }

  _tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  _train() {
    this.totalDocs = this.trainingData.length;

    for (const [text, label] of this.trainingData) {
      this.classDocs[label] = (this.classDocs[label] || 0) + 1;
      const tokens = this._tokenize(text);

      for (const token of tokens) {
        this.vocabulary.add(token);
        this.wordCounts[label][token] = (this.wordCounts[label][token] || 0) + 1;
        this.totalWords[label] = (this.totalWords[label] || 0) + 1;
      }
    }
  }

  _logProbability(word, cls) {
    const wordCount = (this.wordCounts[cls][word] || 0) + this.smoothing;
    const denominator = (this.totalWords[cls] || 0) + this.smoothing * this.vocabulary.size;
    return Math.log(wordCount / denominator);
  }

  classify(text) {
    const tokens = this._tokenize(text);
    const scores = {};
    const probs = {};

    for (const cls of this.classes) {
      // Prior probability
      let logProb = Math.log((this.classDocs[cls] || 1) / this.totalDocs);

      // Likelihood
      for (const token of tokens) {
        logProb += this._logProbability(token, cls);
      }

      scores[cls] = logProb;
    }

    // Convert log probs to normalized probabilities using softmax
    const maxScore = Math.max(...Object.values(scores));
    const expScores = {};
    let sumExp = 0;

    for (const cls of this.classes) {
      expScores[cls] = Math.exp(scores[cls] - maxScore);
      sumExp += expScores[cls];
    }

    for (const cls of this.classes) {
      probs[cls] = expScores[cls] / sumExp;
    }

    // Sort by probability
    const sorted = this.classes
      .map(cls => ({ department: cls, confidence: probs[cls] }))
      .sort((a, b) => b.confidence - a.confidence);

    const best = sorted[0];
    const entropy = -sorted.reduce((sum, s) => sum + (s.confidence > 0 ? s.confidence * Math.log(s.confidence) : 0), 0);
    const maxEntropy = Math.log(this.classes.length);
    const uncertainty = entropy / maxEntropy; // 0 = certain, 1 = totally uncertain

    return {
      department: best.department,
      confidence: best.confidence,
      uncertainty,
      allScores: sorted,
      confidenceLevel: best.confidence > 0.7 ? 'high' : best.confidence > 0.45 ? 'medium' : 'low'
    };
  }

  // Retrain with new data (online learning)
  learnCorrection(text, correctLabel) {
    const tokens = this._tokenize(text);
    this.classDocs[correctLabel] = (this.classDocs[correctLabel] || 0) + 1;
    this.totalDocs += 1;

    for (const token of tokens) {
      this.vocabulary.add(token);
      this.wordCounts[correctLabel][token] = (this.wordCounts[correctLabel][token] || 0) + 1;
      this.totalWords[correctLabel] = (this.totalWords[correctLabel] || 0) + 1;
    }
  }
}

module.exports = new NaiveBayesClassifier();
