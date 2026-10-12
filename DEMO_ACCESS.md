# Demo access

No passwords are stored in this repository.

## One-click demo login (development only)
With `DEMO_MODE=true` (the default outside `NODE_ENV=production`), the sign-in screens list the demo accounts and log you in with one click. The server issues the session; no password is sent to the browser. These routes return 404 in production.

- Main app: `http://localhost:3000/index.html` → **Sign In** → **Quick Demo Access**
- SME Finance Copilot: `http://localhost:3000/sme.html`

## Creating the accounts
```bash
cd backend
npm run provision:demo                                   # random password, printed once
DEMO_PASSWORD='choose-your-own-12+chars' npm run provision:demo   # stable password for a private demo box
```
Never commit the password you choose. Use a different value for every deployment.

## SME Finance Copilot users
| User | Email | SME role | Can do |
|---|---|---|---|
| SME Owner · Ananya Textiles | `owner.ananya@company.com` | owner | read, draft, propose, **approve** |
| SME Accountant · Ananya Textiles | `accounts.ananya@company.com` | accountant | read, draft, propose (cannot approve) |
| SME Owner · Chai Point Cafe | `owner.chai@company.com` | owner | full, own tenant only |
| SME Owner · PixelForge Studio | `owner.pixelforge@company.com` | owner | full, own tenant only |
| SME Viewer · PixelForge Studio | `viewer.pixelforge@company.com` | viewer | read only |

The platform accounts (managers, specialists, employee) are listed in the README.
