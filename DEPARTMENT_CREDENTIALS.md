# OneGate Enterprise Directory & Department Credentials Reference
**System URL**: http://localhost:3000/index.html  
**Enterprise Authentication Policy**: 12+ chars, uppercase, lowercase, digit, and special character.

---

## 🔑 Universal Master Password
> **`Password@2026!`**

---

## 🌐 1. Executive / Main Managers (Org-Wide Console)
*Full enterprise oversight across all 11 departments, SLA compliance, cross-department drill-down, and executive read-only inspection.*

| Role | Name | Email | Password | Console Route |
|---|---|---|---|---|
| **Executive Director** | Executive Director | `director.exec@company.com` | `Password@2026!` | `/app/org` |
| **Global Operations Manager** | Global Operations Manager | `main.manager@company.com` | `Password@2026!` | `/app/org` |

---

## 🏢 2. All 11 Department Managers (Department Operations & Calendar Console)
*Department ticket queue, live attendance swipe clock-ins, October 2026 attendance calendar, leave approval queue, staff profile inspector, workload balancing, and broadcast dispatcher.*

| # | Department | Manager Title | Work Email | Password |
|---|---|---|---|---|
| 1 | **IT Support** | IT Operations Head | `it.manager@company.com` | `Password@2026!` |
| - | **IT Support** *(Personal Lead)* | Tarrush Saxena | `tarrushsaxena@gmail.com` | `Password@2026!` |
| 2 | **Human Resources (HR)** | HR Director | `hr.manager@company.com` | `Password@2026!` |
| 3 | **Finance & Accounts** | Finance Controller | `finance.manager@company.com` | `Password@2026!` |
| 4 | **Billing & Invoicing** | Billing Operations Lead | `billing.manager@company.com` | `Password@2026!` |
| 5 | **Customer Support** | Customer Support Manager | `customersupport.manager@company.com` | `Password@2026!` |
| 6 | **Cybersecurity & InfoSec** | Chief InfoSec Officer | `cybersecurity.manager@company.com` | `Password@2026!` |
| 7 | **Data & Analytics** | Data Analytics Lead | `dataanalytics.manager@company.com` | `Password@2026!` |
| 8 | **Investor Relations** | IR Director | `investorrelations.manager@company.com` | `Password@2026!` |
| 9 | **Legal & Compliance** | General Counsel | `legal.manager@company.com` | `Password@2026!` |
| 10 | **Marketing & Brand** | Marketing VP | `marketing.manager@company.com` | `Password@2026!` |
| 11 | **Quality Assurance (QA)** | QA Director | `qualityassurance.manager@company.com` | `Password@2026!` |

---

## 🎧 3. Department Support Executives & Specialists (Specialist Inbox)
*Live specialist inbox, ticket assignment workbench, status controls (Online, Busy, Away, Offline), simulated badge swipe clock-in, and department collaboration.*

| # | Department | Specialist Name | Tier | Work Email | Password |
|---|---|---|---|---|---|
| 1 | **IT Support** | Priya Sharma | L3 Senior Lead | `priya.sharma@company.com` | `Password@2026!` |
| 1 | **IT Support** | Rahul Verma | L1 Frontline | `rahul.verma@company.com` | `Password@2026!` |
| 1 | **IT Support** | IT Support Specialist | L3 Senior Lead | `it.support@company.com` | `Password@2026!` |
| 2 | **Human Resources** | Ananya Roy | L2 Specialist | `hr.support@company.com` | `Password@2026!` |
| 3 | **Finance & Accounts** | Vikram Mehta | L2 Specialist | `finance.support@company.com` | `Password@2026!` |
| 4 | **Billing & Invoicing** | Neha Gupta | L2 Specialist | `billing.support@company.com` | `Password@2026!` |
| 5 | **Customer Support** | Arjun Das | L2 Specialist | `customersupport.support@company.com` | `Password@2026!` |
| 6 | **Cybersecurity** | Kabir Rao | L3 Senior Lead | `cybersecurity.support@company.com` | `Password@2026!` |
| 7 | **Data & Analytics** | Sneha Patel | L2 Specialist | `dataanalytics.support@company.com` | `Password@2026!` |
| 8 | **Investor Relations** | Rohan Singhania | L2 Specialist | `investorrelations.support@company.com` | `Password@2026!` |
| 9 | **Legal & Compliance** | Meera Nambiar | L3 Senior Lead | `legal.support@company.com` | `Password@2026!` |
| 10 | **Marketing & Brand** | Aditya Sen | L2 Specialist | `marketing.support@company.com` | `Password@2026!` |
| 11 | **Quality Assurance** | Tanvi Joshi | L2 Specialist | `qualityassurance.support@company.com` | `Password@2026!` |

---

## 👤 4. Employee Helpdesk Requester
*One Front Door conversational AI chat, automatic triage, self-service resolution, ticket tracking, and warm specialist handoff.*

| Role | Name | Department | Work Email | Password |
|---|---|---|---|---|
| **Employee** | Demo Employee | IT | `employee@company.com` | `Password@2026!` |

---

## 🛠️ Quick Instructions
1. Navigate to **http://localhost:3000/index.html**.
2. Click **Sign In**.
3. In local demo mode, use **Quick demo access → Choose any team member** to open any of the 28 presentation profiles without typing a password.
4. For a manual credential check, copy any work email above and use the documented universal demo password.
5. If the account file has been replaced or credentials have drifted, run `npm run provision:demo` from the `backend` directory. The command is idempotent and is disabled in production.
6. The system automatically routes you to your role's portal:
   - **Main Manager**: Organization Command Center (`/app/org`)
   - **Department Manager**: Department Console (`/app/department`)
   - **Support Executive**: Specialist Inbox (`/app/inbox`)
   - **Employee**: Conversational Helpdesk Portal (`/app/chat`)
